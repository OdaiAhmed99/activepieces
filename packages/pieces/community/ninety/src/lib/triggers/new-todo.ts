import { Property, spreadIfDefined } from '@activepieces/pieces-framework';
import { ninetyCommon } from '../common/client';
import { ninetyProps } from '../common/props';
import { todoTriggerOutputSchema } from '../common/output-schemas';
import { SAMPLE_TODO } from '../common/samples';
import { createNinetyPollingTrigger } from './create-polling-trigger';

export const newTodo = createNinetyPollingTrigger({
  name: 'new_todo',
  displayName: 'New To-Do',
  description: 'Fires when a to-do is created in Ninety',
  aiDescription:
    'Fires once for each new Ninety to-do, carrying the whole to-do: its id, title, due date, owner, team and whether it is personal. Ninety has no webhooks, so this polls and only sees to-dos created since the last check.',
  props: {
    teamId: ninetyProps.teamIdOptional,
    scope: Property.StaticDropdown({
      displayName: 'Scope',
      description:
        'Ninety cannot return personal and team to-dos in one call, so a flow watches one or the other',
      required: false,
      options: {
        options: [
          { label: 'Team to-dos', value: 'team' },
          { label: 'Personal to-dos', value: 'personal' },
        ],
      },
    }),
  },
  outputSchema: todoTriggerOutputSchema,
  sampleData: SAMPLE_TODO,
  fetchRecords: async ({ token, propsValue }) => {
    const { items } = await ninetyCommon.queryTodos({
      token,
      query: {
        sort: 'createdDate',
        order: 'desc',
        page: 1,
        pageSize: 100,
        ...spreadIfDefined('teamId', propsValue.teamId),
        ...spreadIfDefined(
          'isPersonal',
          propsValue.scope === undefined
            ? undefined
            : propsValue.scope === 'personal'
        ),
      },
    });
    return items;
  },
});
