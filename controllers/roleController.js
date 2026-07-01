const roleModel = require('../models/roleModel');
const { success } = require('../utils/response');

const getRoles = async (req, res, next) => {
  try {
    const roles = await roleModel.findAll();
    return success(res, 'Roles retrieved successfully', roles);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getRoles,
};
