import type Docker from "dockerode";
import logger from "#src/common/logger.js";
import { errorMessage } from "#src/Domain/Core/Error/errorMessage.js";
import type { ContainerResources } from "#src/Domain/MicroService/Entity/MicroServiceDetailed.js";
import {
  type DockerStatsSample,
  resourcesBetween,
} from "./containerResources.js";

export interface IContainerResources {
  resourcesOf(containerId: string): ContainerResources | undefined;
}

interface Sampled {
  sample: DockerStatsSample;
  resources: ContainerResources;
}

/**
 * Reads the CPU and memory of the running monitored containers every 30 s,
 * one Docker stats call each ("one-shot": no wait for a second reading), and
 * keeps the last values in memory (EV-86 lot 2). The CPU is computed between
 * two samples, so it is an average over the last 30 s. The socket proxy
 * already lets these GET calls through (CONTAINERS=1). The samplings are a
 * background task of the registry (ADM-N51).
 */
export class ContainerResourceSampler implements IContainerResources {
  private readonly sampled = new Map<string, Sampled>();
  private isSampling = false;

  public constructor(
    private readonly docker: Pick<Docker, "listContainers" | "getContainer">,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public resourcesOf(containerId: string): ContainerResources | undefined {
    return this.sampled.get(containerId)?.resources;
  }

  /**
   * One sampling of every running monitored container. Throws when Docker
   * does not list them, so that the task counts the failure; a container
   * that cannot be read, stopped in between for instance, is only logged.
   */
  public async sample(): Promise<void> {
    if (this.isSampling) return;
    this.isSampling = true;
    try {
      const containers = await this.docker.listContainers({
        filters: {
          label: ["variamos.service.monitored=true"],
          status: ["running"],
        },
      });
      const ids = containers.map((container) => container.Id);
      const outcomes = await Promise.allSettled(
        ids.map((id) => this.sampleOne(id)),
      );
      // A container gone or stopped has no values any more
      for (const id of this.sampled.keys()) {
        if (!ids.includes(id)) this.sampled.delete(id);
      }
      const failed = outcomes.filter(
        (outcome): outcome is PromiseRejectedResult =>
          outcome.status === "rejected",
      );
      if (failed[0]) {
        logger.warn(
          `Container resources: ${failed.length} of ${ids.length} not read: ${errorMessage(failed[0].reason)}`,
        );
      }
    } finally {
      this.isSampling = false;
    }
  }

  private async sampleOne(id: string): Promise<void> {
    const sample: DockerStatsSample = await this.docker
      .getContainer(id)
      .stats({ stream: false, "one-shot": true });
    const previous = this.sampled.get(id)?.sample;
    this.sampled.set(id, {
      sample,
      resources: resourcesBetween(previous, sample, this.now()),
    });
  }
}
