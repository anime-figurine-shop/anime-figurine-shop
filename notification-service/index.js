const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { Kafka } = require('kafkajs');
const { initDB, getCollection } = require('./database');

// Load proto
const PROTO_PATH = path.join(__dirname, '../proto/notification.proto');
const packageDef = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const notificationProto = grpc.loadPackageDefinition(packageDef).notification;

// Kafka consumer setup
const kafka = new Kafka({
  clientId: 'notification-service',
  brokers: ['localhost:9092'],
  retry: { retries: 3 }
});
const consumer = kafka.consumer({ groupId: 'notification-group' });

const connectKafkaConsumer = async () => {
  try {
    await consumer.connect();
    await consumer.subscribe({ topics: ['order-created', 'order-status-updated'], fromBeginning: false });
    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        const data = JSON.parse(message.value.toString());
        const collection = getCollection();
        const type = topic === 'order-created' ? 'ORDER_CREATED' : 'ORDER_UPDATED';
        const msg = topic === 'order-created'
          ? `New order placed by ${data.customerName} — Total: $${data.total}`
          : `Order ${data.orderId} status updated to: ${data.newStatus}`;

        await collection.insert({
          id: uuidv4(),
          type,
          message: msg,
          data: JSON.stringify(data),
          created_at: new Date().toISOString()
        });
        console.log(`📨 Kafka event received and saved: ${type}`);
      }
    });
    console.log('✅ Kafka consumer connected');
  } catch (err) {
    console.log('⚠️ Kafka not available, continuing without it');
  }
};

// gRPC service implementation
const notificationService = {
  CreateNotification: async (call, callback) => {
    try {
      const { type, message, data } = call.request;
      const collection = getCollection();
      const notification = {
        id: uuidv4(),
        type,
        message,
        data: data || '',
        created_at: new Date().toISOString()
      };
      await collection.insert(notification);
      callback(null, notification);
    } catch (err) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  GetAllNotifications: async (call, callback) => {
    try {
      const collection = getCollection();
      const docs = await collection.find().exec();
      const notifications = docs.map(d => d.toJSON());
      callback(null, { notifications });
    } catch (err) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  },

  GetNotificationsByType: async (call, callback) => {
    try {
      const collection = getCollection();
      const docs = await collection.find({
        selector: { type: call.request.type }
      }).exec();
      const notifications = docs.map(d => d.toJSON());
      callback(null, { notifications });
    } catch (err) {
      callback({ code: grpc.status.INTERNAL, message: err.message });
    }
  }
};

// Start everything
const start = async () => {
  await initDB();

  const server = new grpc.Server();
  server.addService(notificationProto.NotificationService.service, notificationService);

  const PORT = '50053';
  server.bindAsync(`0.0.0.0:${PORT}`, grpc.ServerCredentials.createInsecure(), async (err, port) => {
    if (err) {
      console.error('Failed to start Notification Service:', err);
      return;
    }
    console.log(`✅ Notification Service running on port ${port}`);
    await connectKafkaConsumer();
  });
};

start();