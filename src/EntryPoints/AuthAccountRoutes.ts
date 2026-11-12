import { hasPermissions } from "@variamosple/variamos-security";
import type { RequestHandler, Router } from "express";
import HttpStatusCodes from "#src/common/HttpStatusCodes.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { PasswordUpdate } from "#src/Domain/User/Entity/PasswordUpdate.js";
import { PersonalInformationUpdate } from "#src/Domain/User/Entity/PersonalInformationUpdate.js";
import { signedInUser } from "./actor.js";
import type { AuthContext } from "./authContext.js";
import {
  forgotPasswordBody,
  passwordUpdateBody,
  personalInformationBody,
  resetPasswordBody,
  signUpBody,
  verifyTokenBody,
} from "./authRequestBodies.js";
import { mapDomainErrorToHttpStatus } from "./errorMapper.js";
import { sendError } from "./errorResponse.js";
import { readBody } from "./requestBody.js";

const signUp =
  (ctx: AuthContext): RequestHandler =>
  async (req, res) => {
    const { userAuthUseCase } = ctx;
    const transactionId = "signUp";
    const body = readBody(signUpBody, req, res, transactionId);
    if (!body) return;
    const { name, email, password, passwordConfirmation } = body;
    const successfulResponse = new ResponseModel<void>(transactionId, {
      message: "You have successfully signed up!",
    });

    try {
      // Checked once, by the use case; a taken address answers as a free one
      const response = await userAuthUseCase.signUp(
        new RequestModel(transactionId, {
          name,
          email,
          password,
          passwordConfirmation,
        }),
      );

      if (response.errorCode) {
        res
          .status(mapDomainErrorToHttpStatus(response.errorCode))
          .json(response);
        return;
      }

      res.status(HttpStatusCodes.OK).json(successfulResponse);
    } catch (err) {
      sendError(res, err, transactionId);
    }
  };

const myAccount =
  (ctx: AuthContext): RequestHandler =>
  async (req, res) => {
    const { userQueryUseCase } = ctx;
    const transactionId = "myAccount";
    const user = signedInUser(req);
    try {
      const request = new RequestModel<string>(transactionId, user.id);

      const response = await userQueryUseCase.myAccount(request);

      const status = mapDomainErrorToHttpStatus(response.errorCode);
      res.status(status).json(response);
    } catch (error) {
      sendError(res, error, transactionId);
    }
  };

const updateMyAccountInformation =
  (ctx: AuthContext): RequestHandler =>
  async (req, res) => {
    const { userManagementUseCase } = ctx;
    const transactionId = "updateMyAccountInformation";
    const user = signedInUser(req);
    const personalInformation = readBody(
      personalInformationBody,
      req,
      res,
      transactionId,
    );
    if (!personalInformation) return;

    try {
      const personalInformationUpdate = PersonalInformationUpdate.builder()
        .setUserId(user.id)
        .setCountryCode(personalInformation.countryCode)
        .build();

      const request = new RequestModel<PersonalInformationUpdate>(
        transactionId,
        personalInformationUpdate,
      );

      const response = await userManagementUseCase.updateProfile(request);

      const status = mapDomainErrorToHttpStatus(response.errorCode);
      res.status(status).json(response);
    } catch (error) {
      sendError(res, error, transactionId);
    }
  };

const updatePassword =
  (ctx: AuthContext): RequestHandler =>
  async (req, res) => {
    const { userManagementUseCase } = ctx;
    const transactionId = "passwordUpdate";
    const user = signedInUser(req);
    const body = readBody(passwordUpdateBody, req, res, transactionId);
    if (!body) return;
    const { currentPassword, newPassword, passwordConfirmation } = body;
    try {
      const passwordUpdate = PasswordUpdate.builder()
        .setId(user.id)
        .setCurrentPassword(currentPassword)
        .setNewPassword(newPassword)
        .setPasswordConfirmation(passwordConfirmation)
        .build();

      const response = await userManagementUseCase.updatePassword(
        new RequestModel(transactionId, passwordUpdate),
      );

      const status = mapDomainErrorToHttpStatus(response.errorCode);
      res.status(status).json(response);
    } catch (error) {
      sendError(res, error, transactionId);
    }
  };

// Public: the sign-up and reset forms check the same rule as the server
const passwordPolicy =
  (ctx: AuthContext): RequestHandler =>
  async (_req, res) => {
    const { userPasswordUseCase } = ctx;
    try {
      res.status(200).json(await userPasswordUseCase.getPasswordPolicy());
    } catch (err) {
      sendError(res, err, "getPasswordPolicy");
    }
  };

const forgotPassword =
  (ctx: AuthContext): RequestHandler =>
  async (req, res) => {
    const { userPasswordUseCase } = ctx;
    const transactionId = "forgotPassword";
    const body = readBody(forgotPasswordBody, req, res, transactionId);
    if (!body) return;
    const { email } = body;

    try {
      const forgotPasswordResponse = await userPasswordUseCase.requestReset(
        new RequestModel<string>(transactionId, email),
      );

      if (forgotPasswordResponse.errorCode) {
        res
          .status(mapDomainErrorToHttpStatus(forgotPasswordResponse.errorCode))
          .json(forgotPasswordResponse);
        return;
      }

      res.status(200).json(forgotPasswordResponse);
    } catch (err) {
      sendError(res, err, transactionId);
    }
  };

// The token travels in the body, out of URLs and access logs (EV-74)
const verifyToken =
  (ctx: AuthContext): RequestHandler =>
  async (req, res) => {
    const { userPasswordUseCase } = ctx;
    const transactionId = "verifyToken";
    const body = readBody(verifyTokenBody, req, res, transactionId);
    if (!body) return;

    try {
      const verifyResponse = await userPasswordUseCase.verifyToken(
        new RequestModel<string>(transactionId, body.token),
      );

      if (verifyResponse.errorCode) {
        res
          .status(mapDomainErrorToHttpStatus(verifyResponse.errorCode))
          .json(verifyResponse);
        return;
      }

      res.status(200).json(verifyResponse);
    } catch (err) {
      sendError(res, err, transactionId);
    }
  };

const resetPassword =
  (ctx: AuthContext): RequestHandler =>
  async (req, res) => {
    const { userPasswordUseCase } = ctx;
    const transactionId = "resetPassword";
    const body = readBody(resetPasswordBody, req, res, transactionId);
    if (!body) return;
    const { token, password } = body;

    try {
      const resetResponse = await userPasswordUseCase.resetPassword(
        new RequestModel<{ token: string; password: string }>(transactionId, {
          token,
          password,
        }),
      );

      if (resetResponse.errorCode) {
        res
          .status(mapDomainErrorToHttpStatus(resetResponse.errorCode))
          .json(resetResponse);
        return;
      }

      res.status(200).json(resetResponse);
    } catch (err) {
      sendError(res, err, transactionId);
    }
  };

/** Account routes: sign-up, own account, forgotten password. */
export function addAccountRoutes(router: Router, ctx: AuthContext): void {
  router.post("/sign-up", signUp(ctx));
  router.get(
    "/my-account",
    hasPermissions(["my-account::query"]),
    myAccount(ctx),
  );
  router.put(
    "/my-account/information",
    hasPermissions(["my-account::update"]),
    updateMyAccountInformation(ctx),
  );
  router.put(
    "/password-update",
    hasPermissions(["my-account::update"]),
    updatePassword(ctx),
  );
  router.get("/password-policy", passwordPolicy(ctx));
  router.post("/forgot-password", forgotPassword(ctx));
  router.post("/verify-token", verifyToken(ctx));
  router.post("/reset-password", resetPassword(ctx));
}
