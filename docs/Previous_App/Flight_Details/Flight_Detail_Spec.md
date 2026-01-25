# Flight Detail

This feature provides the ability to view seat and bus assignments for veterans and guardians. The data returned should be grouped based on the pairings. Remember that a guardian could be potentially paired with up to 3 veterans. 

A general rules is that all paired groups should be on the same flight and the same bus. If that is not the case the entries involved should be flagged so that the UI can show a validation error.

The view that returns the data is located here: https://raw.githubusercontent.com/shmakes/hf-basic/refs/heads/master/views/flight_pairings/map.js

The new API response will return data for an entire flight. It will also include some statistics that provide:
The count of people assigned to each bus. (Alpha1 thru Alpha5 and Bravo1 thru Bravo5)
The count of people that are on each tour. (Alpha and Bravo)
The count of people that are on each flight which removes any that are marked "flight.nofly": true.

Note: We will drop the functionality for pairing guardians with veterans as that is no longer part of this step.

The functionality and rules can be further investigated in looking at the old application's code. We do not want to reuse this code but simply examine it to determine the plan for building the new code.

## Related Old Application Artifacts

- Retreiving flight detail data from the database using the "FlightDetail" view: https://raw.githubusercontent.com/shmakes/hf-basic/refs/heads/master/evently/flight_detail/loggedIn/async.js

- Pairing veterans and guardians that are returned from the view: https://raw.githubusercontent.com/shmakes/hf-basic/refs/heads/master/evently/flight_detail/loggedIn/data.js

- Functionality for changing seats and busses directly and flight history updates as well as recalculating the bus and flight counts: https://raw.githubusercontent.com/shmakes/hf-basic/refs/heads/master/_attachments/script/flightdetail.js


## Desired outcomes

We need a set of RESTful API endpoints that use the previous database views to gather the required information for making seat and bus assignments for a specified flight. It would be beneficial to provide quick edit enpoints that update the database with seat and bus information without having to load the full veteran and guardian models to update them using the existing endpoints.

As always, there should be tests that provide 100% code coverage and any related documentation should be create and/or updated.