import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { UserFilter } from "@src/Domain/User/Entity/UserFilter";
import { UsersUseCases } from "@src/Domain/User/UserUseCases";
import { isAuthenticated } from "@variamos/variamos-security";
import { Router } from "express";
import logger from "jet-logger";

export const USERS_V1_ROUTE = "/v1/users";

const usersV1Router = Router();

usersV1Router.get("/", isAuthenticated, async (req, res) => {
  const transactionId = "queryUsers";
  const { pageNumber, pageSize, name = null } = req.query;
  try {
    const filter: UserFilter = UserFilter.builder()
      .setName(name as string)
      .setPageNumber(pageNumber as unknown as number)
      .setPageSize(pageSize as unknown as number)
      .build();

    const request = new RequestModel<UserFilter>(transactionId, filter);
    const response = await new UsersUseCases().queryUsers(request);

    const status = response.errorCode || 200;
    res.status(status).json(response);
  } catch (error) {
    logger.err(error);
    const response = new ResponseModel(
      transactionId,
      500,
      "Internal Server Error"
    );
    res.status(500).json(response);
  }
});

usersV1Router.get("/:userId", isAuthenticated, async (req, res) => {
  const transactionId = "queryUserById";
  const userId = req.params.userId;

  try {
    if (!userId) {
      res
        .status(HttpStatusCodes.BAD_REQUEST)
        .json(
          new ResponseModel<unknown>(transactionId).withError(
            HttpStatusCodes.BAD_REQUEST,
            "userId is required."
          )
        );
    }

    const request = new RequestModel<string>(transactionId, userId);
    const response = await new UsersUseCases().queryById(request);

    const status = response.errorCode || 200;
    res.status(status).json(response);
  } catch (error) {
    logger.err(error);
    const response = new ResponseModel(
      transactionId,
      500,
      "Internal Server Error"
    );
    res.status(500).json(response);
  }
});

export default usersV1Router;
