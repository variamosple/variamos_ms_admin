import type { IActivityJournal } from "#src/Domain/Activity/IActivityJournal.js";
import { withJournal } from "#src/Domain/Activity/withJournal.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import type { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import type { Permission } from "#src/Domain/Permission/Entity/Permission.js";
import type { PermissionFilter } from "#src/Domain/Permission/Entity/PermissionFilter.js";
import type { IPermissionRepository } from "#src/Domain/Permission/Repository/IPermissionRepository.js";

export class PermissionUseCase {
  public constructor(
    private readonly permissionRepository: IPermissionRepository,
    private readonly journal: IActivityJournal,
  ) {}

  public queryPermissions(
    request: RequestModel<PermissionFilter>,
  ): Promise<ResponseModel<Permission[]>> {
    return this.permissionRepository.queryPermissions(request);
  }

  public createPermission(
    request: RequestModel<Permission>,
  ): Promise<ResponseModel<Permission>> {
    return withJournal(
      this.journal,
      {
        actorId: request.actorId,
        action: "permission.create",
        entityType: "permission",
        after: { name: request.data?.name ?? null },
        transactionId: request.transactionId,
      },
      () => this.permissionRepository.createPermission(request),
      (response) => ({ entityId: response.data?.id }),
    );
  }

  public async deletePermission(
    request: RequestModel<number>,
  ): Promise<ResponseModel<void>> {
    const before = await this.nameOf(request, request.data);
    return withJournal(
      this.journal,
      {
        actorId: request.actorId,
        action: "permission.delete",
        entityType: "permission",
        entityId: request.data,
        before,
        transactionId: request.transactionId,
      },
      () => this.permissionRepository.deletePermission(request),
    );
  }

  public queryById(
    request: RequestModel<number>,
  ): Promise<ResponseModel<Permission>> {
    return this.permissionRepository.queryById(request);
  }

  public async updatePermission(
    request: RequestModel<Permission>,
  ): Promise<ResponseModel<Permission>> {
    const id = request.data?.id;
    const before = await this.nameOf(request, id);
    return withJournal(
      this.journal,
      {
        actorId: request.actorId,
        action: "permission.update",
        entityType: "permission",
        entityId: id,
        before,
        after: { name: request.data?.name ?? null },
        transactionId: request.transactionId,
      },
      () => this.permissionRepository.updatePermission(request),
    );
  }

  // The name before the change; none when the permission cannot be read,
  // which never stops the operation
  private async nameOf(
    request: RequestModel<unknown>,
    id: number | null | undefined,
  ): Promise<{ name: string } | null> {
    if (id === undefined || id === null) return null;
    try {
      const current = await this.permissionRepository.queryById(
        new RequestModel(request.transactionId, id),
      );
      return current?.data ? { name: current.data.name } : null;
    } catch {
      return null;
    }
  }
}
