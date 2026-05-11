import { Router, type IRouter } from "express";
import healthRouter from "./health";
import brokersRouter from "./brokers";
import strategiesRouter from "./strategies";
import decisionRulesRouter from "./decisionRules";
import tradesRouter from "./trades";
import positionsRouter from "./positions";
import botRouter from "./bot";
import reportsRouter from "./reports";
import dashboardRouter from "./dashboard";
import schwabAuthRouter from "./schwabAuth";
import anthropicRouter from "./anthropic";

const router: IRouter = Router();

router.use(healthRouter);
router.use(brokersRouter);
router.use(strategiesRouter);
router.use(decisionRulesRouter);
router.use(tradesRouter);
router.use(positionsRouter);
router.use(botRouter);
router.use(reportsRouter);
router.use(dashboardRouter);
router.use(schwabAuthRouter);
router.use(anthropicRouter);

export default router;
