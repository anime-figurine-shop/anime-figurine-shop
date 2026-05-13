const { createRxDatabase, addRxPlugin } = require('rxdb');
const { getRxStorageMemory } = require('rxdb/plugins/storage-memory');

const notificationSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    type: { type: 'string' },
    message: { type: 'string' },
    data: { type: 'string' },
    created_at: { type: 'string' }
  },
  required: ['id', 'type', 'message', 'created_at']
};

let db;
let notificationsCollection;

const initDB = async () => {
  db = await createRxDatabase({
    name: 'notificationsdb',
    storage: getRxStorageMemory()
  });

  await db.addCollections({
    notifications: { schema: notificationSchema }
  });

  notificationsCollection = db.notifications;
  console.log('✅ RxDB initialized');
  return notificationsCollection;
};

const getCollection = () => notificationsCollection;

module.exports = { initDB, getCollection };