function(doc) {
  var statuses = ["Active", "Future-Fall", "Future-Spring", "Future-PostRestriction"];
  var conflictOrder = {
    "WWII": 1,
    "Korea": 2,
    "Vietnam": 3,
    "Cold War": 4,
    "Gulf War": 4,
    "Afghanistan": 4,
    "Iraq": 4,
    "Other": 4
  };

  if ((doc.type == "Veteran")
      && (doc.flight.status == "Active")
      && (statuses.indexOf(doc.flight.status) != -1)
      && (doc.flight.id == "None")) {
    emit((conflictOrder[(doc.vet_type || 'WWII')] || 4) + "-" + doc.app_date, doc.flight.group);
  }
}