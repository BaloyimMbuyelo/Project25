-- =====================================================================
-- UBMS migration 003 - Menu management (FR-05 to FR-07, P9)
-- - menu_categories table; menu_items.category text -> category_id (3NF)
-- - soft delete (is_active) so past orders keep their items
-- - price CHECK (> 0 and <= 999.99) and unique names among active items
--
-- Run AFTER migration 002. Safe to re-run.
-- If the base menu script was run more than once, duplicate active items
-- are kept but deactivated (the lowest id stays on the menu).
-- =====================================================================

USE ubuntu_bistro_db;

DROP PROCEDURE IF EXISTS ubms_add_column;
DROP PROCEDURE IF EXISTS ubms_add_check;
DROP PROCEDURE IF EXISTS ubms_add_index;
DROP PROCEDURE IF EXISTS ubms_menu_categories;
DROP PROCEDURE IF EXISTS ubms_add_fk;

DELIMITER //
CREATE PROCEDURE ubms_add_column(IN p_table VARCHAR(64), IN p_column VARCHAR(64), IN p_definition VARCHAR(500))
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_column
    ) THEN
        SET @ddl = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END //

CREATE PROCEDURE ubms_add_check(IN p_table VARCHAR(64), IN p_name VARCHAR(64), IN p_expression VARCHAR(500))
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table
          AND CONSTRAINT_NAME = p_name AND CONSTRAINT_TYPE = 'CHECK'
    ) THEN
        SET @ddl = CONCAT('ALTER TABLE `', p_table, '` ADD CONSTRAINT `', p_name, '` CHECK (', p_expression, ')');
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END //

CREATE PROCEDURE ubms_add_index(IN p_table VARCHAR(64), IN p_name VARCHAR(64), IN p_definition VARCHAR(500))
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND INDEX_NAME = p_name
    ) THEN
        SET @ddl = CONCAT('ALTER TABLE `', p_table, '` ADD ', p_definition);
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END //

CREATE PROCEDURE ubms_add_fk(IN p_table VARCHAR(64), IN p_name VARCHAR(64), IN p_definition VARCHAR(500))
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table
          AND CONSTRAINT_NAME = p_name AND CONSTRAINT_TYPE = 'FOREIGN KEY'
    ) THEN
        SET @ddl = CONCAT('ALTER TABLE `', p_table, '` ADD CONSTRAINT `', p_name, '` ', p_definition);
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END //

-- Move the free-text category column into menu_categories (runs once).
CREATE PROCEDURE ubms_menu_categories()
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'menu_items' AND COLUMN_NAME = 'category'
    ) THEN
        INSERT IGNORE INTO menu_categories (name)
            SELECT DISTINCT LEFT(TRIM(category), 50) FROM menu_items WHERE TRIM(category) <> '';

        UPDATE menu_items m
        INNER JOIN menu_categories c ON c.name = LEFT(TRIM(m.category), 50)
        SET m.category_id = c.category_id
        WHERE m.category_id IS NULL;

        ALTER TABLE menu_items DROP COLUMN category;
    END IF;
END //
DELIMITER ;

-- ---------- Categories (Table 24) ----------
CREATE TABLE IF NOT EXISTS menu_categories (
    category_id INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(50)  NOT NULL UNIQUE,
    description VARCHAR(255) NULL,
    sort_order  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    is_active   TINYINT(1)   NOT NULL DEFAULT 1,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- The categories the team's menu screens already use
INSERT IGNORE INTO menu_categories (name, sort_order) VALUES
('Starters', 1), ('Main Course', 2), ('Desserts', 3), ('Drinks', 4);

-- ---------- Menu items (Table 18) ----------
CALL ubms_add_column('menu_items', 'category_id', 'INT NULL AFTER name');
CALL ubms_add_column('menu_items', 'is_active', 'TINYINT(1) NOT NULL DEFAULT 1 AFTER available');

CALL ubms_menu_categories();

-- Any item still without a category goes to Main Course
UPDATE menu_items
SET category_id = (SELECT category_id FROM menu_categories WHERE name = 'Main Course')
WHERE category_id IS NULL;

ALTER TABLE menu_items
    MODIFY category_id INT NOT NULL,
    MODIFY available TINYINT(1) NOT NULL DEFAULT 1;

CALL ubms_add_index('menu_items', 'idx_menu_category_active', 'INDEX idx_menu_category_active (category_id, is_active)');
CALL ubms_add_fk('menu_items', 'fk_menu_item_category',
    'FOREIGN KEY (category_id) REFERENCES menu_categories(category_id) ON DELETE RESTRICT');
CALL ubms_add_check('menu_items', 'chk_item_price', 'price > 0 AND price <= 999.99');

-- Deactivate duplicate active names (keep the lowest id) before the unique key
UPDATE menu_items m
INNER JOIN menu_items keeper
        ON keeper.name = m.name AND keeper.is_active = 1 AND keeper.id < m.id
SET m.is_active = 0
WHERE m.is_active = 1;

-- Names are unique among active items only, so a deleted item's name can be
-- reused (P9). Deleted rows have NULL here and do not clash.
CALL ubms_add_column('menu_items', 'active_name',
    'VARCHAR(150) GENERATED ALWAYS AS (IF(is_active = 1, name, NULL)) STORED');
CALL ubms_add_index('menu_items', 'uq_menu_active_name', 'UNIQUE KEY uq_menu_active_name (active_name)');

DROP PROCEDURE IF EXISTS ubms_add_column;
DROP PROCEDURE IF EXISTS ubms_add_check;
DROP PROCEDURE IF EXISTS ubms_add_index;
DROP PROCEDURE IF EXISTS ubms_menu_categories;
DROP PROCEDURE IF EXISTS ubms_add_fk;
