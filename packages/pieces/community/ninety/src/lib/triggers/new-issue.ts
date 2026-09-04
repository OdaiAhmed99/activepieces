import { spreadIfDefined } from '@activepieces/pieces-framework';
import { ninetyCommon } from '../common/client';
import { ninetyProps } from '../common/props';
import { issueTriggerOutputSchema } from '../common/output-schemas';
import { SAMPLE_ISSUE } from '../common/samples';
import { createNinetyPollingTrigger } from './create-polling-trigger';

export const newIssue = createNinetyPollingTrigger({
  name: 'new_issue',
  displayName: 'New Issue',
  description: 'Fires when an issue is raised in Ninety',
  aiDescription:
    'Fires once for each new Ninety issue, carrying the whole issue: its id, title, description, priority, team and term. Ninety has no webhooks, so this polls and only sees issues raised since the last check.',
  props: {
    teamId: ninetyProps.teamIdOptional,
    intervalCode: ninetyProps.intervalCode,
  },
  outputSchema: issueTriggerOutputSchema,
  sampleData: SAMPLE_ISSUE,
  fetchRecords: async ({ token, propsValue }) => {
    const { items } = await ninetyCommon.queryIssues({
      token,
      query: {
        sortField: 'createdDate',
        sortDirection: 'DESC',
        pageIndex: 0,
        pageSize: 100,
        ...spreadIfDefined('teamId', propsValue.teamId),
        ...spreadIfDefined('intervalCode', propsValue.intervalCode),
      },
    });
    return items;
  },
});
