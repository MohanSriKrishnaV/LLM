import sqlite3 from "sqlite3"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import { mkdirSync } from "fs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = join(__dirname, "../../data")
const dbPath = join(dataDir, "chat.db")

mkdirSync(dataDir, { recursive: true })

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Error opening database:", err)
  } else {
    console.log("Connected to SQLite database")

    db.serialize(() => {

      db.run("PRAGMA foreign_keys = ON")

      initializeDatabase()
      InitializeToolsDbs()
      ClearToolsDb()
      SeedToolsDb()

    })
  }
})

/* ---------------- CLEAR DATA ---------------- */

const ClearToolsDb = () => {

  db.run(`DELETE FROM order_items`)
  db.run(`DELETE FROM orders`)
  db.run(`DELETE FROM products`)
  db.run(`DELETE FROM users`)

  db.run(`DELETE FROM sqlite_sequence WHERE name='order_items'`)
  db.run(`DELETE FROM sqlite_sequence WHERE name='orders'`)
  db.run(`DELETE FROM sqlite_sequence WHERE name='products'`)
  db.run(`DELETE FROM sqlite_sequence WHERE name='users'`)

  console.log("Previous data cleared and IDs reset")
}

/* ---------------- SEED DATA ---------------- */

const SeedToolsDb = () => {

  // USERS
  db.run(`
    INSERT INTO users (name, email) VALUES
    ('Mohan', 'mohan@test.com'),
    ('Alice', 'alice@test.com'),
    ('Bob', 'bob@test.com'),
    ('Charlie', 'charlie@test.com'),
    ('David', 'david@test.com')
  `, err => {
    if (err) console.error("Users insert error:", err)
    else console.log("Users seeded")
  })


  // PRODUCTS
  db.run(`
    INSERT INTO products (name, price, stock) VALUES
    ('Laptop',1200,10),
    ('Mouse',25,200),
    ('Keyboard',70,150),
    ('Monitor',300,50),
    ('USB Cable',10,500),
    ('Headphones',150,80),
    ('Webcam',90,60),
    ('External HDD',200,40),
    ('Desk Lamp',45,120),
    ('Office Chair',250,30)
  `, err => {
    if (err) console.error("Products insert error:", err)
    else console.log("Products seeded")
  })


  // ORDERS
  db.run(`
    INSERT INTO orders (user_id, status) VALUES
    (1,'shipped'),
    (1,'processing'),
    (2,'delivered'),
    (2,'cancelled'),
    (3,'shipped'),
    (3,'processing'),
    (4,'delivered'),
    (5,'processing')
  `, err => {
    if (err) console.error("Orders insert error:", err)
    else console.log("Orders seeded")
  })


  // ORDER ITEMS
  db.run(`
    INSERT INTO order_items (order_id, product_id, quantity) VALUES
    (1,1,1),
    (1,2,2),
    (2,3,1),
    (2,5,3),
    (3,4,1),
    (3,6,1),
    (4,7,2),
    (5,8,1),
    (6,2,5),
    (7,9,1),
    (8,10,1)
  `, err => {
    if (err) console.error("OrderItems insert error:", err)
    else console.log("Order items seeded")
  })

}

/* ---------------- CHAT TABLE ---------------- */

const initializeDatabase = () => {

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, err => {
    if (err) console.error("Error creating messages table:", err)
    else console.log("Messages table initialized")
  })

}

/* ---------------- TOOL DATABASE TABLES ---------------- */

const InitializeToolsDbs = () => {

  // USERS
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      email TEXT
    )
  `, err => {
    if (err) console.error("Error creating users table:", err)
    else console.log("Users table initialized")
  })


  // PRODUCTS
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      price REAL,
      stock INTEGER
    )
  `, err => {
    if (err) console.error("Error creating products table:", err)
    else console.log("Products table initialized")
  })


  // ORDERS
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      status TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `, err => {
    if (err) console.error("Error creating orders table:", err)
    else console.log("Orders table initialized")
  })


  // ORDER ITEMS
  db.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      product_id INTEGER,
      quantity INTEGER,
      UNIQUE(order_id, product_id),
      FOREIGN KEY(order_id) REFERENCES orders(id),
      FOREIGN KEY(product_id) REFERENCES products(id)
    )
  `, err => {
    if (err) console.error("Error creating order_items table:", err)
    else console.log("Order items table initialized")
  })

}

/* ---------------- PROMISE WRAPPER ---------------- */

const dbPromise = {

  run: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) reject(err)
        else resolve({ lastID: this.lastID, changes: this.changes })
      })
    })
  },

  get: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err)
        else resolve(row)
      })
    })
  },

  all: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err)
        else resolve(rows || [])
      })
    })
  }

}

export default dbPromise