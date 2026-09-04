import {
  createAction,
  Property,
  spreadIfDefined,
} from '@activepieces/pieces-framework';
import { ninetyAuth } from '../auth';
import { ninetyCommon } from '../common/client';
import { ninetyPropUtils, ninetyProps } from '../common/props';
import { todoListOutputSchema } from '../common/output-schemas';

export const findTodos = createAction({
  auth: ninetyAuth,
  name: 'find_todos',
  classification: 'SEARCH',
  displayName: 'Find To-Dos',
  description: 'Search Ninety to-dos by team, owner, status, text or due date',
  audience: 'both',
  aiMetadata: {
    description:
      'Searches Ninety to-dos and returns the matching page. A single call returns either team to-dos or personal ones, never both, so set Scope accordingly. Read-only and safe to retry.',
    idempotent: true,
  },
  outputSchema: todoListOutputSchema,
  props: {
    teamId: ninetyProps.teamIdOptional,
    scope: Property.StaticDropdown({
      displayName: 'Scope',
      description:
        'Ninety cannot return personal and team to-dos in one call. Leave empty to let Ninety apply its own default.',
      required: false,
      options: {
        options: [
          { label: 'Team to-dos', value: 'team' },
          { label: 'Personal to-dos', value: 'personal' },
        ],
      },
    }),
    userIds: ninetyProps.ownerIds,
    completed: ninetyProps.completedFilter,
    archived: ninetyProps.archivedFilter,
    searchText: ninetyProps.searchText,
    title: Property.ShortText({
      displayName: 'Exact Title',
      description: 'Matches the whole title only',
      required: false,
    }),
    dueDateFrom: Property.DateTime({
      displayName: 'Due On Or After',
      required: false,
    }),
    dueDateTo: Property.DateTime({
      displayName: 'Due On Or Before',
      required: false,
    }),
    sort: Property.ShortText({
      displayName: 'Sort By',
      description: 'A to-do field such as dueDate or createdDate',
      required: false,
      defaultValue: 'createdDate',
    }),
    order: Property.StaticDropdown({
      displayName: 'Order',
      required: false,
      defaultValue: 'desc',
      options: {
        options: [
          { label: 'Newest first', value: 'desc' },
          { label: 'Oldest first', value: 'asc' },
        ],
      },
    }),
    page: ninetyProps.page,
    pageSize: Property.Number({
      displayName: 'Page Size',
      description: 'How many to-dos to return. Ninety allows up to 100.',
      required: false,
    }),
  },
  async run({ auth, propsValue }) {
    const scope = propsValue.scope;
    const { items, totalCount } = await ninetyCommon.queryTodos({
      token: auth.secret_text,
      query: {
        ...spreadIfDefined('teamId', propsValue.teamId),
        ...spreadIfDefined(
          'isPersonal',
          scope === undefined ? undefined : scope === 'personal'
        ),
        ...spreadIfDefined(
          'userIds',
          propsValue.userIds === undefined || propsValue.userIds.length === 0
            ? undefined
            : propsValue.userIds
        ),
        ...spreadIfDefined(
          'completed',
          ninetyPropUtils.triStateToBoolean(propsValue.completed)
        ),
        ...spreadIfDefined(
          'archived',
          ninetyPropUtils.triStateToBoolean(propsValue.archived)
        ),
        ...spreadIfDefined('searchText', propsValue.searchText),
        ...spreadIfDefined('title', propsValue.title),
        ...spreadIfDefined(
          'dueDateFrom',
          ninetyCommon.toOptionalDateOnly({
            value: propsValue.dueDateFrom,
            field: 'Due On Or After',
          })
        ),
        ...spreadIfDefined(
          'dueDateTo',
          ninetyCommon.toOptionalDateOnly({
            value: propsValue.dueDateTo,
            field: 'Due On Or Before',
          })
        ),
        ...spreadIfDefined('sort', propsValue.sort),
        ...spreadIfDefined('order', propsValue.order),
        ...spreadIfDefined('page', propsValue.page),
        ...spreadIfDefined('pageSize', propsValue.pageSize),
      },
    });

    return { todos: items, count: items.length, totalCount };
  },
});
