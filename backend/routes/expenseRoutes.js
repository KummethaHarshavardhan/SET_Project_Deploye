import express from 'express';
import {
  createExpense,
  getExpenses,
  getExpenseById,
  updateExpense,
  deleteExpense,
  getExpenseSummary,
  getMonthlyReport,
  exportExpensesCsv,
  getDashboardSummary,
} from '../controllers/expenseController.js';
import { protect } from '../middleware/authMiddleware.js';
import { validateExpense } from '../middleware/validateMiddleware.js';

const router = express.Router();

router.use(protect);

router.get('/summary', getExpenseSummary);
router.get('/monthly-report', getMonthlyReport);
router.get('/export', exportExpensesCsv);
router.get('/dashboard-summary', getDashboardSummary);

router.route('/')
  .get(getExpenses)
  .post(validateExpense, createExpense);

router.route('/:id')
  .get(getExpenseById)
  .put(updateExpense)
  .delete(deleteExpense);

export default router;
