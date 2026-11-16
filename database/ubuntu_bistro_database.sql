
CREATE DATABASE IF NOT EXISTS ubuntu_bistro_db;

USE ubuntu_bistro_db;

CREATE TABLE IF NOT EXISTS menu_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    image VARCHAR(500),
    available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
);

SHOW TABLES;

DESCRIBE menu_items;

USE ubuntu_bistro_db;

INSERT INTO menu_items
(name, description, category, price, image, available)
VALUES
(
    'Grilled Chicken',
    'Tender grilled chicken served with seasonal vegetables.',
    'Main Course',
    195.00,
    '/images/restaurant-pictures/grilled-chicken.jpeg',
    TRUE
),
(
    'Beef Burger',
    'Juicy beef patty served with fresh lettuce and tomato.',
    'Main Course',
    120.00,
    '/images/restaurant-pictures/beef-burger.jpeg',
    TRUE
),
(
    'Creamy Pasta',
    'Pasta prepared in a rich and creamy sauce.',
    'Main Course',
    145.00,
    '/images/restaurant-pictures/creamy-pasta.jpeg',
    TRUE
),
(
    'Garden Salad',
    'Fresh seasonal vegetables with house dressing.',
    'Starters',
    95.00,
    '/images/restaurant-pictures/green-salad.jpeg',
    FALSE
),
(
    'Chocolate Cake',
    'Rich chocolate cake served as a dessert.',
    'Desserts',
    75.00,
    '/images/restaurant-pictures/chocolate-cake.jpeg',
    TRUE
);

SELECT * FROM menu_items;
