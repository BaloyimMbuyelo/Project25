-- =====================================================================
-- UBMS migration 001 - Reservations, Inventory and Payments
-- Aligns modules 4.0, 5.0 and 6.0 with the System Design (sections 4.5,
-- 4.6 P6-P8 and Appendix A) while keeping the repo's existing table names.
--
-- Run AFTER ubuntu_bistro_database.sql and ubms_database_extension.sql.
-- Safe to re-run.
--
-- WARNING: reservations, payments and stock_movements are DROPPED and
-- recreated. Before this migration no application code wrote to them (the
-- screens used browser storage), so they should only hold test rows.
-- restaurant_tables and ingredients are altered in place because orders,
-- supplier_ingredients and menu_item_ingredients reference them.
-- =====================================================================

USE ubuntu_bistro_db;

-- ---------- Helpers so the ALTERs can be re-run ----------
DROP PROCEDURE IF EXISTS ubms_add_column;
DROP PROCEDURE IF EXISTS ubms_add_check;

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
DELIMITER ;

-- ---------- Restaurant tables (TableStatus: In service / Out of service) ----------
-- Widen the ENUM first so existing values can be converted, then narrow it.
ALTER TABLE restaurant_tables
    MODIFY status ENUM('AVAILABLE','OCCUPIED','MAINTENANCE','IN_SERVICE','OUT_OF_SERVICE')
    NOT NULL DEFAULT 'IN_SERVICE';

UPDATE restaurant_tables SET status = 'IN_SERVICE'     WHERE status IN ('AVAILABLE','OCCUPIED');
UPDATE restaurant_tables SET status = 'OUT_OF_SERVICE' WHERE status = 'MAINTENANCE';

ALTER TABLE restaurant_tables
    MODIFY status ENUM('IN_SERVICE','OUT_OF_SERVICE') NOT NULL DEFAULT 'IN_SERVICE';

CALL ubms_add_check('restaurant_tables', 'chk_table_capacity', 'capacity BETWEEN 1 AND 20');

-- Seed tables 1-8 (2-8 seats), as in Appendix A
INSERT IGNORE INTO restaurant_tables (table_number, capacity) VALUES
('T1',2),('T2',2),('T3',4),('T4',4),('T5',6),('T6',4),('T7',8),('T8',2);

-- ---------- Reservations (Table 21, P6, Figure 8) ----------
DROP TABLE IF EXISTS reservations;

CREATE TABLE reservations (
    reservation_id   INT AUTO_INCREMENT PRIMARY KEY,
    reservation_ref  VARCHAR(12)  NOT NULL UNIQUE,          -- e.g. RS-0240
    customer_id      INT          NULL,                     -- registered customer
    guest_name       VARCHAR(150) NULL,                     -- phone / walk-in bookings by staff
    guest_phone      VARCHAR(20)  NULL,
    table_id         INT          NULL,                     -- NULL until allocated
    reservation_date DATE         NOT NULL,
    start_time       TIME         NOT NULL,
    end_time         TIME         NOT NULL,                 -- start_time + sitting length
    party_size       TINYINT UNSIGNED NOT NULL,
    special_requests VARCHAR(255) NULL,
    status ENUM('PENDING','CONFIRMED','SEATED','COMPLETED','CANCELLED','NO_SHOW')
                     NOT NULL DEFAULT 'PENDING',
    cancel_reason    VARCHAR(255) NULL,
    created_by       INT          NOT NULL,                 -- user who captured it
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_res_customer FOREIGN KEY (customer_id) REFERENCES users(user_id) ON DELETE RESTRICT,
    CONSTRAINT fk_res_table    FOREIGN KEY (table_id) REFERENCES restaurant_tables(table_id) ON DELETE RESTRICT,
    CONSTRAINT fk_res_user     FOREIGN KEY (created_by) REFERENCES users(user_id),
    CONSTRAINT chk_res_party   CHECK (party_size BETWEEN 1 AND 20),
    CONSTRAINT chk_res_times   CHECK (end_time > start_time),
    CONSTRAINT chk_res_party_owner CHECK (customer_id IS NOT NULL OR guest_name IS NOT NULL),
    INDEX idx_res_table_slot (table_id, reservation_date, start_time, end_time),
    INDEX idx_res_date (reservation_date, status),
    INDEX idx_res_customer (customer_id, reservation_date)
) ENGINE=InnoDB;

-- ---------- Inventory items (Table 23, P8) ----------
-- 'ingredients' is kept as the inventory item table because the supplier
-- tables reference it.
CALL ubms_add_column('ingredients', 'category', 'VARCHAR(50) NULL AFTER ingredient_name');
CALL ubms_add_column('ingredients', 'is_active', 'TINYINT(1) NOT NULL DEFAULT 1');
CALL ubms_add_check('ingredients', 'chk_inv_qty', 'quantity_in_stock >= 0');
CALL ubms_add_check('ingredients', 'chk_inv_reorder', 'reorder_level >= 0');

-- ---------- Stock movements (Table 23, BR-07) ----------
DROP TABLE IF EXISTS stock_movements;

CREATE TABLE stock_movements (
    movement_id   INT AUTO_INCREMENT PRIMARY KEY,
    ingredient_id INT NOT NULL,
    user_id       INT NOT NULL,
    movement_type ENUM('STOCK_IN','STOCK_OUT','WASTAGE','ADJUSTMENT_IN','ADJUSTMENT_OUT') NOT NULL,
    quantity      DECIMAL(10,2) NOT NULL,                   -- always positive; direction comes from the type
    balance_after DECIMAL(10,2) NOT NULL,                   -- reconciliation
    reason        VARCHAR(255) NULL,                        -- required for wastage and adjustments (API)
    moved_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_mv_item FOREIGN KEY (ingredient_id) REFERENCES ingredients(ingredient_id) ON DELETE RESTRICT,
    CONSTRAINT fk_mv_user FOREIGN KEY (user_id) REFERENCES users(user_id),
    CONSTRAINT chk_mv_qty CHECK (quantity > 0),
    CONSTRAINT chk_mv_balance CHECK (balance_after >= 0),
    INDEX idx_mv_item_date (ingredient_id, moved_at)
) ENGINE=InnoDB;

-- ---------- Payment methods (lookup) ----------
CREATE TABLE IF NOT EXISTS payment_methods (
    payment_method_id  TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    method_name        VARCHAR(30) NOT NULL UNIQUE,
    requires_reference TINYINT(1)  NOT NULL DEFAULT 0,
    is_active          TINYINT(1)  NOT NULL DEFAULT 1
) ENGINE=InnoDB;

INSERT IGNORE INTO payment_methods (method_name, requires_reference) VALUES
('Cash',0), ('Card (terminal)',1), ('EFT / QR',1);

-- ---------- Payments (Table 22, P7, Q10) ----------
DROP TABLE IF EXISTS payments;

CREATE TABLE payments (
    payment_id        INT AUTO_INCREMENT PRIMARY KEY,
    order_id          INT NOT NULL,
    payment_method_id TINYINT UNSIGNED NOT NULL,
    recorded_by       INT NOT NULL,                         -- cashier
    amount            DECIMAL(10,2) NOT NULL,               -- equals the order total (API)
    amount_tendered   DECIMAL(10,2) NULL,                   -- cash only
    paid_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    payment_status    ENUM('PAID','VOIDED') NOT NULL DEFAULT 'PAID',
    reference_number  VARCHAR(30) NULL UNIQUE,              -- card slip / EFT reference (text)
    receipt_number    VARCHAR(12) NOT NULL UNIQUE,          -- e.g. RC-000512
    void_reason       VARCHAR(255) NULL,
    voided_by         INT NULL,
    voided_at         DATETIME NULL,
    -- One active Paid payment per order (Q10). NULL for voided rows, so any
    -- number of voided rows may exist alongside one Paid row.
    active_order_id   INT GENERATED ALWAYS AS (IF(payment_status = 'PAID', order_id, NULL)) STORED,
    CONSTRAINT fk_pay_order  FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE RESTRICT,
    CONSTRAINT fk_pay_method FOREIGN KEY (payment_method_id) REFERENCES payment_methods(payment_method_id),
    CONSTRAINT fk_pay_user   FOREIGN KEY (recorded_by) REFERENCES users(user_id),
    CONSTRAINT fk_pay_voider FOREIGN KEY (voided_by) REFERENCES users(user_id),
    CONSTRAINT chk_pay_amount CHECK (amount > 0),
    CONSTRAINT chk_pay_tender CHECK (amount_tendered IS NULL OR amount_tendered >= amount),
    UNIQUE KEY uq_pay_active_order (active_order_id),
    INDEX idx_pay_date (paid_at),
    INDEX idx_pay_order (order_id)
) ENGINE=InnoDB;

DROP PROCEDURE IF EXISTS ubms_add_column;
DROP PROCEDURE IF EXISTS ubms_add_check;
