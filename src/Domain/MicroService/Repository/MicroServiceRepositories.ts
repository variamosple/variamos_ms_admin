import type { IMicroServiceConfigRepository } from "./IMicroServiceConfigRepository.js";
import type { IMicroServiceControlRepository } from "./IMicroServiceControlRepository.js";
import type { IMicroServiceRepository } from "./IMicroServiceRepository.js";

/**
 * The microservice repositories, one per subject. A use case takes the ones
 * it uses (Pick<MicroServiceRepositories, ...>).
 */
export interface MicroServiceRepositories {
  services: IMicroServiceRepository;
  control: IMicroServiceControlRepository;
  configuration: IMicroServiceConfigRepository;
}
