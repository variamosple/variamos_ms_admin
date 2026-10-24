/** Tells administrators they were assigned to a bug (EV-84 lot 3). */
export interface IBugAssignmentNotifier {
  notifyAssigned(
    userIds: string[],
    bugTitle: string,
    actorId?: string,
  ): Promise<void>;
}
