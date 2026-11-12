import type { IUserPasswordRepository } from "./IUserPasswordRepository.js";
import type { IUserRepository } from "./IUserRepository.js";
import type { IUserSignInRepository } from "./IUserSignInRepository.js";

/**
 * The user repositories, one per subject. A use case takes the ones it uses
 * (Pick<UserRepositories, ...>).
 */
export interface UserRepositories {
  accounts: IUserRepository;
  signIn: IUserSignInRepository;
  passwords: IUserPasswordRepository;
}
