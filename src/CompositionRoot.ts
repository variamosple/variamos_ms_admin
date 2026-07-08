import EnvVars from "@src/common/EnvVars";
import { UserRepositoryImpl } from "./DataProviders/User/UserRepository";
import { MicroServiceRepositoryImpl } from "./DataProviders/MicroService/MicroServiceRepository";

export const UserRepositoryInstance = new UserRepositoryImpl({
  bcryptSaltRounds: EnvVars.Auth.APP.BCRYPT_SALT_ROUNDS,
});

export const MicroServiceRepositoryInstance = new MicroServiceRepositoryImpl({
  socketPath: EnvVars.DOCKER.SOCKET_PATH,
});
