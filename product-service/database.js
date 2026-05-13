const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'products.db'));

// Create products table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    series TEXT NOT NULL,
    character TEXT NOT NULL,
    price REAL NOT NULL,
    stock INTEGER NOT NULL,
    image_url TEXT
  )
`);

// Insert some sample data if table is empty
const count = db.prepare('SELECT COUNT(*) as count FROM products').get();
if (count.count === 0) {
  const insert = db.prepare(`
    INSERT INTO products (id, name, series, character, price, stock, image_url)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insert.run('1', 'Naruto Uzumaki Figure', 'Naruto', 'Naruto', 29.99, 50, 'https://example.com/naruto.jpg');
  insert.run('2', 'Monkey D. Luffy Figure', 'One Piece', 'Luffy', 34.99, 30, 'https://example.com/luffy.jpg');
  insert.run('3', 'Goku Super Saiyan Figure', 'Dragon Ball Z', 'Goku', 39.99, 20, 'https://example.com/goku.jpg');
  insert.run('4', 'Levi Ackerman Figure', 'Attack on Titan', 'Levi', 44.99, 15, 'https://example.com/levi.jpg');
  insert.run('5', 'Rem Figure', 'Re:Zero', 'Rem', 49.99, 25, 'https://example.com/rem.jpg');
  console.log('Sample products inserted!');
}

module.exports = db;