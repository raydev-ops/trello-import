
var appKey = "";
var token = "";

function onOpen(){
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var menuEntries = [{name: "Display Available Members", functionName: "displayMembers"},{name: "Display Available Boards", functionName: "displayBoards"},{name: "Display Available Lists", functionName: "displayLists"},{name: "Upload to Trello", functionName: "upload"}];
  ss.addMenu("Trello", menuEntries);
 }
 
function upload() {
    var startTime = new Date();  
    Logger.log("Started at:"+ startTime); 
    var error = checkControlValues(true,true);
    if (error != "") {
      Browser.msgBox("ERROR:Values in the Control sheet have not been set. Please fix the following error:\n " + error);
      return;
    }
    
    var url = constructTrelloURL("boards/"+ ScriptProperties.getProperty("boardID") + "/lists");
    var resp = UrlFetchApp.fetch(url, {"method": "get"});
    var lists = Utilities.jsonParse(resp.getContentText());
    var listIds = new Array();
    var listNames = new Array();
  
    for (var i=0; i< lists.length; i++) {
      listIds.push(lists[i].id);
      listNames.push(lists[i].name);
    } 
    
    
    
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Contents");
    var defaultListID = ScriptProperties.getProperty("listID");
    var boardID = ScriptProperties.getProperty("boardID");
    var existingLabels = getExistingLabels(boardID);
    if (existingLabels == null || existingLabels.length ==0) {
      
      return;
    }
    var successCount = 0;
    var partialCount = 0;
  
    var rows=sheet.getDataRange().getValues();
               
    var headerRow = rows[0]; 
  
    for (var j = 1; j < rows.length; j++) {
      
      r=j+1;         
      var currentRow = rows[j];
      var status = currentRow[0];
      
      currentTime = new Date(); 
      Logger.log("Row " + r + ":" + currentTime); 
      if (currentRow[2].trim() == "" && currentRow[1].trim() == "") {
        // Do nothing if no card name
      }  
      else if (currentTime.valueOf() - startTime.valueOf() >= 330000) { // 5.5 minutes - scripts time out at 6 minutes
        Browser.msgBox("WARNING: Script was about to time out so upload has been terminated gracefully ." + successCount + " items were uploaded successfully.");
        return;
      }
      else if (status == "Started") {
        Browser.msgBox("Error: Item at row " + r + " has a status of 'Started' which means the Trello card MAY have been partially created for this item. Verify the state of the card, and either:\na) Delete the card from Trello if it's incomplete, and change status cell to blank.\n b)If card is complete, then change the status of the item to 'Completed'");
        return;
      }  
      else if (status == "") {
        var listId = defaultListID;
        var overrideListName = currentRow[1];
        if (overrideListName != "") {
          var index = listNames.indexOf(overrideListName);
          if (index >= 0) {
            listId = listIds[index];
          }  
          else {
            listId = createList(overrideListName,boardID);
            if (listId != "") {
              listIds.push(listId);
              listNames.push(overrideListName);
            }  
          }
          
        }  
        
        if (listId == "") {
          Browser.msgBox("Could not determine list for row " + r + ". Aborting run.");
          return;
        }  
        
        var statusCell = sheet.getRange(r,1,1,1);
        statusCell.setValue("Started");
        partialCount ++;
        
        if (currentRow[2].trim() != "") {
          
          var dueDate = null;
          // changed
          if (currentRow[4] !== '') {
            dueDate = currentRow[4];
          }  
          
          // check if title from spreadsheet is in api call for that list, if so, update card - changed
          var cardExists = getCards(currentRow[2], currentRow[3], listId, dueDate, currentRow[6], currentRow[5], existingLabels);

          if (cardExists)
          {
            deleteCardAttachments(cardId);
            // changed
            createTrelloAttachment(cardId,currentRow[7]);
            // delete all checklists in card
            deleteCardChecklists(cardId);
            

            // trying to work out checklists
            // changed
            for (var i = 10; i < headerRow.length; i++) {
              if (headerRow[i] !== "" && currentRow[i] !== "") {
                updateChecklist(cardId, boardID,headerRow[i],currentRow[i]);
              }  
            }
          
          }
          else
          {
            // post - changed
            var card = createTrelloCard(currentRow[2],currentRow[3],listId,dueDate,currentRow[6]);        
            // changed
            createTrelloAttachment(card.id,currentRow[7]);
            // changed
            addTrelloLabels(card.id,currentRow[5],existingLabels);
            // changed
            var comment = currentRow[8];
            var comments = comment.split("\n");
            
            for (var i = 0; i < comments.length; i++) {
              if (comments[i] != "") {
                createTrelloComment(card.id,comments[i]);
              }
            }
            // changed
            for (var i = 10; i < headerRow.length; i++) {
              if (headerRow[i] !== "" && currentRow[i] !== "") {
                addChecklist(card, boardID,headerRow[i],currentRow[i]);
              }  
            }
          }
        }  
        
      statusCell.setValue("Completed");   
      SpreadsheetApp.flush();
      partialCount --;
      successCount ++;
          
      }
      else if (status != "Completed") {
          Browser.msgBox("Error: Item at row " + r + " has a status of '" + status + "' Change status to 'Completed' if not required, or clear it to allow it to be uploaded." );
        return;
      }    
     
    }
     Browser.msgBox( successCount + " items were uploaded successfully.");
     return;
}

function getExistingLabels(boardId) {

    var values = null;
    var url = constructTrelloURL("boards/" + boardId + "/labels");
    var resp = UrlFetchApp.fetch(url, {"method": "get","muteHttpExceptions":true });
    if (resp.getResponseCode() == 200) {
      var values = Utilities.jsonParse(resp.getContentText());
    }  
    else {
      Browser.msgBox("ERROR:Unable to return existing labels from board:" + resp.getContentText());
    }
      
    return values;
}  
 
 
function addChecklist(card, boardID,checklistName, checklistData) {
  
  var data = checklistData.split("\n");
  var checklist = null;
  
  for (var i = 0; i < data.length; i++) {
    if (data[i] != "") {
      if (checklist == null) {
         checklist = createTrelloChecklist(card.id,checklistName);
      }  
      createTrelloChecklistItem(checklist.id,data[i]);
    }
    
  } 
  
  if (checklist !== null) {
    addTrelloChecklistToCard(checklist.id, card.id);
  }  
  
}  
  

  
function createTrelloCard(cardName, cardDesc, listID, dueDate,members){
  var name = cardName;
  //if (storyPoints != "") {
  //  name = "(" + storyPoints + ") " + cardName;
 // }
  var url = constructTrelloURL("cards");
  var payload = {"name":name,"desc":cardDesc,"idList":listID,"due":dueDate};
  
  if (members !="") {

    payload.idMembers = members.replace(/\s/g,'');
  }  
  
return postPayloadToTrello(url,payload);
  
}
 
function createTrelloChecklist(cardID, name){
  var url = constructTrelloURL("checklists");
  return postPayloadToTrello(url,{"name":name,"idCard":cardID});
}
  
function createTrelloComment(cardID, name){
  var url = constructTrelloURL("cards/"+ cardID + "/actions/comments");
  return postPayloadToTrello(url,{"text":name});
}

function createTrelloAttachment(cardID, attachment){
  if (attachment == "") {
    return;
  }  
  var attachments = attachment.split(",");
  for (var i= 0; i< attachments.length;i++) {
    var url = constructTrelloURL("cards/"+ cardID + "/attachments");
    var resp = postPayloadToTrello(url,{"url":attachments[i]});
  }
  return;
}


  
function addTrelloLabels(cardID, label,existingLabels){
  if (label == "" ) {
    return;
  }  
  var labels = label.split(",");
  for (var i= 0; i< labels.length;i++) {
    var labelId = getIdForLabelName(labels[i],existingLabels);
    if (labelId == null) {
      var url = constructTrelloURL("cards/"+ cardID + "/labels");
      var resp = postPayloadToTrello(url,{"color":null,"name":labels[i]});
    }
    else {
      var url = constructTrelloURL("cards/"+ cardID + "/idLabels");
      var resp = postPayloadToTrello(url,{"value":labelId});
    }  
  }  
  return;
}

function getIdForLabelName(label,existingLabels) {
  
  for (var i=0; i < existingLabels.length;i++) {
    if (existingLabels[i].name.toUpperCase() == label.toUpperCase()) {
      return existingLabels[i].id;
    }  
  }  
  return null;
}  

function createTrelloChecklistItem(checkListID, name){
  var url = constructTrelloURL("checklists/" + checkListID + "/checkItems");
  return postPayloadToTrello(url,{"name":name});
}

function addTrelloChecklistToCard(checkListID, cardID) {
  var url = constructTrelloURL("cards/" + cardID + "/checklists");
  return postPayloadToTrello(url,{"value":checkListID});
}

function postPayloadToTrello(url,payload) {
  var resp = UrlFetchApp.fetch(url, {"method": "post", "payload":payload});
  return Utilities.jsonParse(resp.getContentText());
}  



  
function checkControlValues(requireList, requireBoard) {
  var col = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Control").getRange("B3:B6").getValues();
  
  appKey = col[0][0].toString().trim();
  if(appKey == "") {
    return "App Key not found";
  }  
  
  token = col[1][0].toString().trim();
  if(token == "") {
    return "Token not found";
  }  
  
  if (requireBoard) {
    var bid = col[2][0].toString().trim();
    if(bid == "") {
      return "Board ID not found";
    }  
    ScriptProperties.setProperty("boardID", bid);
  }  
  
  if (requireList) {
    var lid = col[3][0].toString().trim();
    
    ScriptProperties.setProperty("listID", lid);
  } 
  
  return "";
  
} 
 
  
  
function createList(overrideListName, boardID) {
 
  var url = constructTrelloURL("lists") ;
  var payload = {"name":overrideListName,"idBoard":boardID,"pos":"bottom"};
  var resp = UrlFetchApp.fetch(url, {"method": "post", "payload":payload});
  
  if (resp.getResponseCode() == 200) {
    return  Utilities.jsonParse(resp.getContentText()).id;
  }
  
  Logger.log(resp);
  
  return "";
} 



function constructTrelloURL(baseURL){
 
  return "https://trello.com/1/"+ baseURL +"?key="+appKey+"&token="+token;
}

function displayLists() {
    
    var error = checkControlValues(false,true);
    if (error != "") {
      Browser.msgBox("ERROR:Values in the Control sheet have not been set. Please fix the following error:\n " + error);
      return;
    }
  
    var url = constructTrelloURL("boards/"+ ScriptProperties.getProperty("boardID") + "/lists");
    var resp = UrlFetchApp.fetch(url, {"method": "get"});
    var values = Utilities.jsonParse(resp.getContentText())
    
  
    var html = HtmlService.createHtmlOutput("<h3>Available Lists</h3>");
   
    html.append("<table><thead><tr>");
    html.append("<th style='border:1px black solid;text-align:left;padding:.25em;'>List Name</th>");
    html.append("<th style='border:1px black solid;text-align:left;padding:.25em;'>List Id</th></tr></thead>");
  
    
    for (var i=values.length-1;i>=0;i--) {
      html.append("<tr><td style='border:1px black solid;padding:.25em;'>"+values[i].name+"</td><td style='border:1px black solid;padding:.25em;'>"+values[i].id+"</td></tr>");
    }
   
                     
    SpreadsheetApp.getActiveSpreadsheet().show(html);
  
  
  return;
}

function displayBoards() {
    
    var error = checkControlValues(false,false);
    if (error != "") {
      Browser.msgBox("ERROR:Values in the Control sheet have not been set. Please fix the following error:\n " + error);
      return;
    }
  
    var url = constructTrelloURL("members/me/boards");
    var resp = UrlFetchApp.fetch(url, {"method": "get"});
    var values = Utilities.jsonParse(resp.getContentText())
    
    var html = HtmlService.createHtmlOutput("<h3>Available Boards</h3>");
   
  html.append("<table><thead><tr>");
  html.append("<th style='border:1px black solid;text-align:left;padding:.25em;'>Board Name</th>");
    html.append("<th style='border:1px black solid;text-align:left;padding:.25em;'>Board Id</th></tr></thead>");
  
    
    for (var i=values.length-1;i>=0;i--) {
      html.append("<tr><td style='border:1px black solid;padding:.25em;'>"+values[i].name+"</td><td style='border:1px black solid;padding:.25em;'>"+values[i].id+"</td></tr>");
    }
   
                     
    SpreadsheetApp.getActiveSpreadsheet().show(html);
  
  
  return;
}

function displayMembers() {
    
   var error = checkControlValues(false,true);
    if (error != "") {
      Browser.msgBox("ERROR:Values in the Control sheet have not been set. Please fix the following error:\n " + error);
      return;
    }
  
    var url = constructTrelloURL("boards/"+ ScriptProperties.getProperty("boardID") + "/members");
    var resp = UrlFetchApp.fetch(url, {"method": "get"});
    var values = Utilities.jsonParse(resp.getContentText())
  
  
    var html = HtmlService.createHtmlOutput("<h3>Available Members</h3>");
   
    html.append("<table><thead><tr>");
    html.append("<th style='border:1px black solid;text-align:left;padding:.25em;'>Member Name</th>");
    html.append("<th style='border:1px black solid;text-align:left;padding:.25em;'>Member Id</th></tr></thead>");
    for (var i=values.length-1;i>=0;i--) {
      html.append("<tr><td style='border:1px black solid;padding:.25em;'>"+values[i].fullName+"</td><td style='border:1px black solid;padding:.25em;'>"+values[i].id+"</td></tr>");
    }        
    SpreadsheetApp.getActiveSpreadsheet().show(html);
  
  return;
}


// update code

// Update card -------------------------------------------------

function updateTrelloCard(cardId, cardName, cardDesc, cardDue, members, cardLabels, existingLabels){

  deleteCardMembers(cardId);

  var url = constructTrelloURL("cards/" + cardId);
  var payload = {"name": cardName,"desc": cardDesc, "due": cardDue, "idLabels": "", "labels": "", "idChecklists": ""};
  
  if (members !="") {
    payload.idMembers = members.replace(/\s/g,'');
  }    
  
  UrlFetchApp.fetch(url, {"method": "put", "payload":payload});
  
  updateTrelloLabels(cardId, cardLabels, existingLabels);

}


// Attachments. Delete attachments before readding new ones. No "PUT" request for them. 

function deleteCardAttachments(cardId)
{
  var url = constructTrelloURL("cards/" + cardId + "/attachments");
  var resp = UrlFetchApp.fetch(url, {"method": "get"});
  var values = Utilities.jsonParse(resp.getContentText());
    for (var i=values.length-1;i>=0;i--) {
      {
         attachmentId = values[i].id;
         var url = constructTrelloURL("cards/" + cardId + "/attachments/" + attachmentId);
         UrlFetchApp.fetch(url, {"method": "delete"});
      }
    }
}


function deleteCardChecklists(cardId)
{
  var url = constructTrelloURL("cards/" + cardId + "/checklists");
  var resp = UrlFetchApp.fetch(url, {"method": "get"});
  var values = Utilities.jsonParse(resp.getContentText());
    for (var i=values.length-1;i>=0;i--) {
      {
         checklistId = values[i].id;
         var url = constructTrelloURL("cards/" + cardId + "/checklists/" + checklistId);
         UrlFetchApp.fetch(url, {"method": "delete"});
      }
   }
}


function deleteCardMembers(cardId)
{
  var url = constructTrelloURL("cards/" + cardId + "/members");
  var resp = UrlFetchApp.fetch(url, {"method": "get"});
  var values = Utilities.jsonParse(resp.getContentText());
    for (var i=values.length-1;i>=0;i--) {
      {
         memberId = values[i].id;
         var url = constructTrelloURL("cards/" + cardId + "/idMembers/" + memberId);
         UrlFetchApp.fetch(url, {"method": "delete"});
      }
   }
}



// update labels 
function updateTrelloLabels(cardID, label, existingLabels){
  // if cell is empty
  if (label == "" ) {
    return;
  }  
  // create array
  var labels = label.split(",");
  // loop through array
  for (var i= 0; i< labels.length;i++) {
    // get ids of existing labels on the board
    var labelId = getIdForLabelName(labels[i],existingLabels);
    
    // if label id doesnt already exist (if new label), create label on card with new label;
    if (labelId == null) {
      var url = constructTrelloURL("cards/"+ cardID + "/labels");
      var resp = postPayloadToTrello(url,{"color":null,"name":labels[i]});
    }
    // use existing id and put label on card
    else {
      var url = constructTrelloURL("cards/"+ cardID + "/idLabels");
        var resp = postPayloadToTrello(url,{"value":labelId});
      }
  }  
  return;
}


function updateChecklist(cardId, boardID, checklistName, checklistData) {
  var data = checklistData.split("\n");
  var checklist = null;
  for (var i = 0; i < data.length; i++) {
    if (data[i] != "") {
      if (checklist == null) {
         checklist = createTrelloChecklist(cardId,checklistName);
      }  
      createTrelloChecklistItem(checklist.id,data[i]);
    }
  } 
  if (checklist !== null) {
    addTrelloChecklistToCard(checklist.id, cardId);
  }  
}  



// check if card exists in the list (is the title there)
// if the value in the spreadsheet for card titles is in the api call for that list, run update -----------------

function getCards(cardName, cardDesc, listId, cardDue, cardMembers, cardLabels, existingLabels){  
 
  // get all cards in the list
  var url = constructTrelloURL("lists/" + listId + "/cards");
  var resp = UrlFetchApp.fetch(url, {"method": "get"});
  var values = Utilities.jsonParse(resp.getContentText());
  
  // cycle through the cards in the list
  for (var i=values.length-1;i>=0;i--) {    
        
    // check if the card exists, remove the "points" from its name
    if (cardName == values[i].name)
    {
      cardId = values[i].id;
      
      // add any new points to its name
      //if (cardPoints != "") {
      //cardName = "(" + cardPoints + ") " + cardName;
      //}
      
      var updateCard = updateTrelloCard(cardId, cardName, cardDesc, cardDue, cardMembers, cardLabels, existingLabels);
      var cardExists = true;
    }
  }
  return cardExists;
}


 

