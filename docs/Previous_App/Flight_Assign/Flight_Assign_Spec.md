# Flight Assignment

This feature provides the ability to view assignments for a specified flight and add veterans to that flight from the wait list following the established rules.

It takes into account the capacity of the flight and begins adding veterans to the flight while updating statistics on how many veterans and guardians are currently present.

It will take veterans from the wait list in the order of their application date, while prioritizing earlier conflicts over later conflicts. When selecting veterans, it will take any veterans that are in the same veteran group as soon as the first veteran in that group is selected. It will always add paired guardians with their veterans.

Note: We will drop the functionality of importing bulk guardians as that is no longer used.

The functionality and rules can be further investigated in looking at the old application's code. We do not want to reuse this code but simply examine it to determine the plan for building the new code.

## Related Old Application Artifacts

- Retreiving flight assignment data from the database using the "FlightAssignment" view: https://raw.githubusercontent.com/shmakes/hf-basic/refs/heads/master/evently/flight_assign/loggedIn/async.js

- Pairing veterans and guardians that are returned from the view: https://raw.githubusercontent.com/shmakes/hf-basic/refs/heads/master/evently/flight_assign/loggedIn/data.js

- Functionality for adding a number of veterans from the waitlist: https://raw.githubusercontent.com/shmakes/hf-basic/refs/heads/master/evently/flight_assign/loggedIn/selectors/%23addVets/click.js

- Functionality for doing the actual data change and flight history updates as well as recalculating the flight counts: https://raw.githubusercontent.com/shmakes/hf-basic/refs/heads/master/_attachments/script/flightassign.js

- Some progress display functionality to show while adding veterans. This could be replaced on the UI with a real progress bar but some form of communication will be required: https://raw.githubusercontent.com/shmakes/hf-basic/refs/heads/master/evently/flight_assign/loggedIn/after.js


## Desired outcomes

We need a set of RESTful API endpoints that use the previous database views to gather the required information for making flight assignments for a specified flight.
This requires gathering metadata about that flight's capacity and any veterans and guardians that are already assigned.
It also requires a way to add a certain number of additional veterans to the flight in a bulk process while following all the previously prescribed rules. There should be a way to receive feedback while the bulk process is running and get the results when it is complete or errors if something goes wrong.

As always, there should be tests that provide 100% code coverage and any related documentation should be create and/or updated.