-- =====================================================================
-- UBMS migration 002 - Orders, user management and login hardening
-- Supports System Design P1/P2 (login, lockout), P4/P5 (orders),
-- P11 (staff users) and 4.8.6 (audit logging).
--
-- Run AFTER migration 001. Safe to re-run. No tables are dropped.
--
-- Value renames to match the design (Q1, Q4):
--   orders.order_status ACCEPTED -> CONFIRMED
--   orders.order_type   TAKEAWAY -> COLLECTION
-- =====================================================================

USE ubuntu_bistro_db;

DROP PROCEDURE IF EXISTS ubms_add_column;
DROP PROCEDURE IF EXISTS ubms_add_check;
DROP PROCEDURE IF EXISTS ubms_add_index;

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

CREATE PROCEDURE ubms_add_index(IN p_table VARCHAR(64), IN p_name VARCHAR(64), IN p_columns VARCHAR(500))
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND INDEX_NAME = p_name
    ) THEN
        SET @ddl = CONCAT('ALTER TABLE `', p_table, '` ADD INDEX `', p_name, '` (', p_columns, ')');
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END //
DELIMITER ;

-- ---------- Users: lockout and first-login password change (Table 16) ----------
CALL ubms_add_column('users', 'failed_logins', 'TINYINT UNSIGNED NOT NULL DEFAULT 0');
CALL ubms_add_column('users', 'locked_until', 'DATETIME NULL');
CALL ubms_add_column('users', 'last_login_at', 'DATETIME NULL');
CALL ubms_add_column('users', 'must_change_pw', 'TINYINT(1) NOT NULL DEFAULT 0');

-- ---------- Audit log: IP address and search indexes (4.8.6, Table 25) ----------
CALL ubms_add_column('audit_logs', 'ip_address', 'VARCHAR(45) NULL');
CALL ubms_add_index('audit_logs', 'idx_audit_date', 'created_at');
CALL ubms_add_index('audit_logs', 'idx_audit_action', 'action, created_at');

-- ---------- Orders (Table 19, Q1, Q4) ----------
-- Widen, convert, then narrow so the renames work on existing rows.
ALTER TABLE orders
    MODIFY order_status ENUM('PENDING','ACCEPTED','CONFIRMED','PREPARING','READY','COMPLETED','CANCELLED')
    NOT NULL DEFAULT 'PENDING';
UPDATE orders SET order_status = 'CONFIRMED' WHERE order_status = 'ACCEPTED';
ALTER TABLE orders
    MODIFY order_status ENUM('PENDING','CONFIRMED','PREPARING','READY','COMPLETED','CANCELLED')
    NOT NULL DEFAULT 'PENDING';

ALTER TABLE orders
    MODIFY order_type ENUM('DINE_IN','TAKEAWAY','COLLECTION') NOT NULL;
UPDATE orders SET order_type = 'COLLECTION' WHERE order_type = 'TAKEAWAY';
ALTER TABLE orders
    MODIFY order_type ENUM('DINE_IN','COLLECTION') NOT NULL;

CALL ubms_add_column('orders', 'sales_channel', "ENUM('ONLINE','IN_HOUSE') NOT NULL DEFAULT 'IN_HOUSE' AFTER order_type");
CALL ubms_add_column('orders', 'special_instructions', 'VARCHAR(255) NULL AFTER order_status');
CALL ubms_add_column('orders', 'cancel_reason', 'VARCHAR(255) NULL AFTER special_instructions');
CALL ubms_add_column('orders', 'status_updated_at', 'DATETIME NULL');

CALL ubms_add_check('orders', 'chk_order_total', 'total_amount >= 0');
CALL ubms_add_index('orders', 'idx_order_status_time', 'order_status, created_at');
CALL ubms_add_index('orders', 'idx_order_customer', 'customer_id, created_at');
CALL ubms_add_index('orders', 'idx_order_created', 'created_at');

-- ---------- Order items (Table 20) ----------
CALL ubms_add_column('order_items', 'notes', 'VARCHAR(255) NULL');
CALL ubms_add_check('order_items', 'chk_oi_qty', 'quantity BETWEEN 1 AND 25');
CALL ubms_add_check('order_items', 'chk_oi_line', 'subtotal = quantity * unit_price');

DROP PROCEDURE IF EXISTS ubms_add_column;
DROP PROCEDURE IF EXISTS ubms_add_check;
DROP PROCEDURE IF EXISTS ubms_add_index;
