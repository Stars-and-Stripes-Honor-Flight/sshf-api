# Waitlist

This feature provides the ability to view veterans and unpaired guardians to see their posistions on their respective wait lists.
The veteran wait list is the most important as any guardians paired with veterans are added to the flight when their veteran is. 
Only volunteer guardians that are not yet paired to a veteran are shown on the guardian waitlist.

There are database views for each of the lists that return the results in the proper order:

- basic/waitlist_veterans
- basic/waitlist_guardians

There should be a required parameter passed to the retrieval endpoint that determines if veterans or guardians wait list entries are returned.

There should also be parameters for paging the results with a zero-based offset integer and a total return count integer.
These paramters will be used in the database view for the "startKey" and "limit" parameters. 
The default offset should be "0" and the default limit should be 20.

The views will return the entire JSON documents for veterans or guardians so the endpoint should return an array of either "veteran" models or "guardian" models as appropriate.

As always, there should be tests that provide 100% code coverage and any related documentation should be create and/or updated.