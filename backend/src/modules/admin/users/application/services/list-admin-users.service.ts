import { mapAdminUserListItem } from "../../domain/admin-users.helpers";
import type { AdminUsersRepositoryPort } from "../../domain/admin-users.types";

export class ListAdminUsersService {
  constructor(private readonly repository: AdminUsersRepositoryPort) {}

  async execute() {
    const users = await this.repository.listUsers();
    const aggregate = await this.repository.loadSanctionAggregate(
      users.map((user) => user.id),
    );

    return users.map((user) => mapAdminUserListItem(user, aggregate));
  }
}
