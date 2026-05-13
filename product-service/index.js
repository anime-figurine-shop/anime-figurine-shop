const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('./database');

// Load proto file
const PROTO_PATH = path.join(__dirname, '../proto/product.proto');
const packageDef = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const productProto = grpc.loadPackageDefinition(packageDef).product;

// gRPC service implementation
const productService = {
  GetAllProducts: (call, callback) => {
    try {
      const products = db.prepare('SELECT * FROM products').all();
      callback(null, { products });
    } catch (err) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  GetProduct: (call, callback) => {
    try {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(call.request.id);
      if (!product) {
        return callback({ code: grpc.status.NOT_FOUND, message: 'Product not found' });
      }
      callback(null, product);
    } catch (err) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  CreateProduct: (call, callback) => {
    try {
      const { name, series, character, price, stock, image_url } = call.request;
      const id = uuidv4();
      db.prepare(`
        INSERT INTO products (id, name, series, character, price, stock, image_url)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, name, series, character, price, stock, image_url);
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
      callback(null, product);
    } catch (err) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  UpdateProduct: (call, callback) => {
    try {
      const { id, name, series, character, price, stock, image_url } = call.request;
      const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
      if (!existing) {
        return callback({ code: grpc.status.NOT_FOUND, message: 'Product not found' });
      }
      db.prepare(`
        UPDATE products SET name=?, series=?, character=?, price=?, stock=?, image_url=?
        WHERE id=?
      `).run(name, series, character, price, stock, image_url, id);
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
      callback(null, product);
    } catch (err) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  DeleteProduct: (call, callback) => {
    try {
      const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(call.request.id);
      if (!existing) {
        return callback({ code: grpc.status.NOT_FOUND, message: 'Product not found' });
      }
      db.prepare('DELETE FROM products WHERE id = ?').run(call.request.id);
      callback(null, { success: true, message: 'Product deleted successfully' });
    } catch (err) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  }
};

// Start gRPC server
const server = new grpc.Server();
server.addService(productProto.ProductService.service, productService);

const PORT = '50051';
server.bindAsync(`0.0.0.0:${PORT}`, grpc.ServerCredentials.createInsecure(), (err, port) => {
  if (err) {
    console.error('Failed to start Product Service:', err);
    return;
  }
  console.log(`✅ Product Service running on port ${port}`);
});