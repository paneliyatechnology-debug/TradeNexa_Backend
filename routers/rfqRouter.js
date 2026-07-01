const express = require('express');
const rfqController = require('../controllers/rfqController');
const { authenticate, authorize, validate } = require('../middleware/auth');
const { idParam, rfqCreateRules, rfqUpdateRules, rfqListQuery } = require('../middleware/resourceValidation');

const router = express.Router();

router.get('/', rfqListQuery, validate, rfqController.getRfqs);
router.get('/latest', rfqController.getLatestRfqs);
router.get('/:id', idParam, validate, rfqController.getRfq);

// Authenticated write endpoints. Updates & deletes validate ownership in controller.
router.post('/', authenticate, authorize('buyer', 'buyer_seller', 'admin'), rfqCreateRules, validate, rfqController.createRfq);
router.put('/:id', authenticate, idParam, rfqUpdateRules, validate, rfqController.updateRfq);
router.delete('/:id', authenticate, idParam, validate, rfqController.deleteRfq);

module.exports = router;
