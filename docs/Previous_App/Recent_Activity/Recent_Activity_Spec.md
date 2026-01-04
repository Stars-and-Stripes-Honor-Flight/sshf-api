# Recent Activity

This feature provides the ability to view various categories of recent changes from most recent to oldest.

There are database views for each of the categories that return the results in the proper order:

| Type     | View                               |
|----------|------------------------------------|
| Modified | basic/admin_recent_changes         |
| Added    | basic/admin_recent_additions       |
| Call     | basic/admin_recent_call_changes    |
| Flight   | basic/admin_recent_flight_changes  |
| Pairing  | basic/admin_recent_pairing_changes |


There should be a required parameter passed to the retrieval endpoint that determines the "Type" of entries returned and the respective view should be used to retrieve the results.

There should also be parameters for paging the results with a zero-based offset integer and a total return count integer.
These paramters will be used in the database views for the "startKey" and "limit" parameters. 
The default offset should be "0" and the default limit should be 20.

The views will return and array of JSON documents with the same 8 properties:

- `id`: the "id" property from each object in the "rows" array.
- `type`: either "Veteran" or "Guardian" from the "type" property of each object in the "rows" array
- `name`: the applicant's name from the "name" property of each object in the "rows" array
- `city`: the applicant's city from the "city" property of each object in the "rows" array
- `appdate`: the date the application was received from the "appdate" property of each object in the "rows" array
- `recdate`: the date the change occurred as a UTC ISO date string from the "recdate" property of each object in the "rows" array
- `recby`: the user that made the change from the "recby" property of each object in the "rows" array
- `change`: a short summary of the change from the change from the "change" property of each object in the "rows" array

There is a sample of the output schema used by all the views located in "Recent_Activity_Sample_Data.json"

As always, there should be tests that provide 100% code coverage and any related documentation should be create and/or updated.