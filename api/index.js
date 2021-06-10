import express from 'express';
import storeRoute from './StoreApi.js';

const router = express.Router();
export default router;

router.use('/store', storeRoute);

// Errors
router.use((req, res) => {
  const message = `Route ${req.url} not found`;
  res.status(404).send({
    error: true,
    message,
  });
});
