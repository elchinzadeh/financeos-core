export class AbandonGoalCommand {
  constructor(
    public readonly userId: string,
    public readonly clientId: string,
    public readonly goalId: string,
  ) {}
}
