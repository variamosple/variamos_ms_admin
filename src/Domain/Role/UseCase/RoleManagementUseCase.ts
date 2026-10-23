import type { IActivityJournal } from "#src/Domain/Activity/IActivityJournal.js";
import { withJournal } from "#src/Domain/Activity/withJournal.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import type { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import type { Role } from "#src/Domain/Role/Entity/Role.js";
import type { IRoleRepository } from "#src/Domain/Role/Repository/IRoleRepository.js";

export class RoleManagementUseCase {
  public constructor(
    private readonly roleRepository: IRoleRepository,
    private readonly journal: IActivityJournal,
  ) {}

  public createRole(request: RequestModel<Role>): Promise<ResponseModel<Role>> {
    return withJournal(
      this.journal,
      {
        actorId: request.actorId,
        action: "role.create",
        entityType: "role",
        after: { name: request.data?.name ?? null },
        transactionId: request.transactionId,
      },
      () => this.roleRepository.createRole(request),
      (response) => ({ entityId: response.data?.id }),
    );
  }

  public async deleteRole(
    request: RequestModel<string>,
  ): Promise<ResponseModel<void>> {
    const before = await this.nameOf(request, request.data);
    return withJournal(
      this.journal,
      {
        actorId: request.actorId,
        action: "role.delete",
        entityType: "role",
        entityId: request.data,
        before,
        transactionId: request.transactionId,
      },
      () => this.roleRepository.deleteRole(request),
    );
  }

  public async updateRole(
    request: RequestModel<Role>,
  ): Promise<ResponseModel<Role>> {
    const id = request.data?.id;
    const before = await this.nameOf(request, id);
    return withJournal(
      this.journal,
      {
        actorId: request.actorId,
        action: "role.update",
        entityType: "role",
        entityId: id,
        before,
        after: { name: request.data?.name ?? null },
        transactionId: request.transactionId,
      },
      () => this.roleRepository.updateRole(request),
    );
  }

  // The name before the change; none when the role cannot be read, which
  // never stops the operation
  private async nameOf(
    request: RequestModel<unknown>,
    id: string | number | null | undefined,
  ): Promise<{ name: string } | null> {
    if (id === undefined || id === null) return null;
    try {
      const current = await this.roleRepository.queryById(
        new RequestModel(request.transactionId, String(id)),
      );
      return current?.data ? { name: current.data.name } : null;
    } catch {
      return null;
    }
  }
}
