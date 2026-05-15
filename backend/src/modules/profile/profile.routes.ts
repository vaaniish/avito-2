import { Router } from "express";
import { profileAccountRouter } from "./profile.account.routes";
import { profileAddressRouter } from "./profile.address.routes";
import { profileEngagementRouter } from "./profile.engagement.routes";
import { profileOrdersRouter } from "./profile.orders.routes";
import { profilePolicyRouter } from "./policy";
import { profileUserRouter } from "./profile.user.routes";

const profileRouter = Router();

profileRouter.use(profileUserRouter);
profileRouter.use(profileAddressRouter);
profileRouter.use(profileOrdersRouter);
profileRouter.use(profileAccountRouter);
profileRouter.use(profilePolicyRouter);
profileRouter.use(profileEngagementRouter);

export { profileRouter };
