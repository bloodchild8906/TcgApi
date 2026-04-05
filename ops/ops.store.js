const config = require('../config');

const driverMap = {
  mongo: './drivers/mongo.driver',
  mysql: './drivers/mysql.driver',
  postgres: './drivers/postgres.driver',
  mssql: './drivers/mssql.driver',
};

let driver = null;

const getDriver = () => {
  if (!driver) {
    const path = driverMap[config.ops_db_driver];
    if (!path) {
      throw new Error(`Unsupported OPS_DB_DRIVER: ${config.ops_db_driver}`);
    }
    driver = require(path);
  }

  return driver;
};

const call = async (method, ...args) => {
  const activeDriver = getDriver();
  if (typeof activeDriver[method] !== 'function') {
    throw new Error(`Operational store method not implemented: ${method}`);
  }

  return activeDriver[method](...args);
};

exports.connect = async () => {
  await call('connect', config);
};

exports.close = async () => {
  if (!driver) {
    return;
  }
  await call('close');
  driver = null;
};

exports.getStatus = () => {
  if (!driver) {
    return {
      driver: config.ops_db_driver,
      connected: false,
      detail: 'Operational store not initialized',
    };
  }

  return driver.getStatus();
};

exports.clearAll = async () => call('clearAll');
exports.listRoles = async () => call('listRoles');
exports.getRole = async (roleId) => call('getRole', roleId);
exports.upsertRole = async (role) => call('upsertRole', role);
exports.deleteRole = async (roleId) => call('deleteRole', roleId);
exports.getUserRoleAssignment = async (userId) => call('getUserRoleAssignment', userId);
exports.setUserRoleAssignment = async (userId, roleIds, metadata) => call('setUserRoleAssignment', userId, roleIds, metadata);
exports.listUserRoleAssignments = async () => call('listUserRoleAssignments');
exports.createTrade = async (trade) => call('createTrade', trade);
exports.getTrade = async (tradeId) => call('getTrade', tradeId);
exports.listTrades = async (filter) => call('listTrades', filter);
exports.updateTrade = async (tradeId, patch) => call('updateTrade', tradeId, patch);
