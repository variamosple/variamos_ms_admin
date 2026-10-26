import type { IActivityJournal } from "#src/Domain/Activity/IActivityJournal.js";
import { withJournal } from "#src/Domain/Activity/withJournal.js";
import type { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { INotificationDispatcher } from "../INotificationDispatcher.js";
import type { INotificationRecipientDirectory } from "../INotificationRecipientDirectory.js";

export interface NotificationAudience {
  audience: "broadcast" | "role" | "users";
  roles?: string[];
  userIds?: string[];
}

export interface NotificationDispatchRequest extends NotificationAudience {
  title: string;
  body: string;
  actorId: string | null;
}

/**
 * Administrator notifications (T-18 lot 3b): who an audience reaches, and
 * the dispatch itself, recorded in the activity journal without the body of
 * the message (T-24).
 */
export class NotificationDispatchUseCase {
  public constructor(
    private readonly recipients: INotificationRecipientDirectory,
    private readonly dispatcher: INotificationDispatcher,
    private readonly journal: IActivityJournal,
  ) {}

  /** How many accounts a dispatch would reach; nothing is sent nor recorded. */
  public async countRecipients(
    request: RequestModel<NotificationAudience>,
  ): Promise<ResponseModel<{ count: number }>> {
    const response = new ResponseModel<{ count: number }>(
      request.transactionId,
    );
    const recipients = await this.recipientsOf(
      request.data ?? ({} as NotificationAudience),
    );
    if ("refusal" in recipients) {
      return response.withError(
        DomainErrorCodes.INVALID_INPUT,
        recipients.refusal,
      );
    }
    return response.withResponse({ count: recipients.ids.length });
  }

  public async dispatch(
    request: RequestModel<NotificationDispatchRequest>,
  ): Promise<ResponseModel<void>> {
    const data = request.data ?? ({} as NotificationDispatchRequest);
    let recipientCount = 0;

    return withJournal(
      this.journal,
      {
        actorId: data.actorId,
        action: "notification.dispatch",
        entityType: "notification",
        after: {
          audience: data.audience ?? null,
          roles: data.roles ?? null,
          title: data.title ?? null,
        },
        transactionId: request.transactionId,
      },
      async () => {
        const response = new ResponseModel<void>(request.transactionId);
        if (!data.title || !data.body) {
          return response.withError(
            DomainErrorCodes.INVALID_INPUT,
            "Title and body are required.",
          );
        }
        const recipients = await this.recipientsOf(data);
        if ("refusal" in recipients) {
          return response.withError(
            DomainErrorCodes.INVALID_INPUT,
            recipients.refusal,
          );
        }
        const { ids } = recipients;
        recipientCount = ids.length;

        await this.dispatcher.dispatchNotification({
          recipients: {
            userIds: ids.length > 0 ? ids : undefined,
          },
          templateKey: "admin_alert",
          variables: { title: data.title, body: data.body },
          actorId: data.actorId,
        });
        response.message = "Notification dispatched successfully.";
        return response;
      },
      () => ({
        after: {
          audience: data.audience,
          roles: data.roles ?? null,
          title: data.title,
          recipientCount,
        },
      }),
    );
  }

  // Active accounts of the audience, or why the audience is refused
  private async recipientsOf({
    audience,
    roles,
    userIds,
  }: NotificationAudience): Promise<{ ids: string[] } | { refusal: string }> {
    if (audience === "broadcast") {
      return { ids: await this.recipients.activeUserIds() };
    }
    if (audience === "role") {
      if (!roles || roles.length === 0) {
        return { refusal: "At least one role is required for role audience." };
      }
      return { ids: await this.recipients.activeUserIdsWithRoles(roles) };
    }
    if (audience === "users") {
      if (!userIds || userIds.length === 0) {
        return {
          refusal: "At least one user ID is required for users audience.",
        };
      }
      return { ids: userIds };
    }
    return { refusal: "Invalid audience type." };
  }
}
