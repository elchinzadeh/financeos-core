export class CompleteGoalCommand {
  constructor(
    public readonly userId: string,
    public readonly clientId: string,
    public readonly goalId: string,
  ) {}
}
