const SLACK_BOT_TOKEN = PropertiesService.getScriptProperties().getProperty("SLACK_BOT_TOKEN"); // Botトークンをここに入力
const BLACK_USER_IDS = ['U075UG3LL1E']; // ボット自身のユーザーIDを設定(非応答者リスト)
const WHITE_USER_IDS = ['U074B8ALXHQ', 'U074PU35NBT', 'U0744KBGG86']; // 許可されたユーザーIDを追加(応答者リスト)

const GPT_API_KEY = PropertiesService.getScriptProperties().getProperty("GPT_API_KEY"); // GPT APIキーを入力
const ASST_ID = PropertiesService.getScriptProperties().getProperty("ASST_ID"); // assistant IDを登録

const SPREAD_SHEET_ID = PropertiesService.getScriptProperties().getProperty("SPREAD_SHEET_ID"); // SpreadSheetID

// Cache Service
const cache = CacheService.getScriptCache();

function testGenerateResponseFromGPT(){
  messageText = "こんにちは"
  generateResponseFromGPT(messageText);
}

function testGenerateResponseFromGPT(){
  responseText = "これはテストです"
  channelId = ""
  postMessageToSlack(channelId, responseText);
}

// SpreadSheetLog
function sslog(tag, msg){
  const sheetForLog = SpreadsheetApp.openById(SPREAD_SHEET_ID).getSheets()[0]; //sheetIDはとりあえず0
  sheetForLog.appendRow([ // わかりやすいように1列目には現在の日時を書き込む
    Utilities.formatDate(new Date(), 'JST', 'yyyy/MM/dd HH:mm:ss'), 
    tag,
    JSON.stringify(msg)
  ]);
}

function doPost(e) {
  var slackEvent = JSON.parse(e.postData.contents);
  Logger.log(JSON.stringify(slackEvent)); // 受信したイベントデータをログに出力
  sslog("json", slackEvent);

  // slackの3秒タイムアウトリトライ対策
  if (slackEvent.event.client_msg_id == null) { // NULL
    sslog("Retry", "Return; NULL");
    return;
  } else if (cache.get(slackEvent.event.client_msg_id) == 'done') { // キャッシュからの取得; get(キー)
    sslog("Retry", "Return; client_msg_id is 'done'");
    return;// ContentService.createTextOutput(); // 新しい TextOutput オブジェクトを作成
  } else {
    sslog("Retry", "Continue; This is First Time");
    cache.put(slackEvent.event.client_msg_id, 'done', 600); // キャッシュへの追加; put(キー, 値, 保持期限(秒))
  }
  // slackの3秒タイムアウトリトライ対策

  var userId = slackEvent.event.user;

  // ボット自身のメッセージまたは許可されていないユーザーからのメッセージであれば何もしない
  if (BLACK_USER_IDS.includes(userId) || !WHITE_USER_IDS.includes(userId)) {  
    Logger.log("Message from unauthorized user or bot itself. Ignoring.");
    sslog("doPost", "Message from unauthorized user or bot itself. Ignoring.");
    return;
  }

  var messageText = slackEvent.event.text;
  var channelId = slackEvent.event.channel;

  Logger.log("Message received: " + messageText + " from channel: " + channelId);
  sslog("doPost", "Message received: " + messageText + " from channel: " + channelId);

  var responseText = generateResponseFromGPT(messageText);
  postMessageToSlack(channelId, responseText);
}

function createThread() {
  const url = 'https://api.openai.com/v1/threads';
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + GPT_API_KEY,
    'OpenAI-Beta': 'assistants=v2'
  };
  const body = {};

  try {
    const response = UrlFetchApp.fetch(url, {
      method: 'POST',
      headers: headers,
      payload: JSON.stringify(body),
      muteHttpExceptions: true,
      validateHttpsCertificates: false,
      followRedirects: false
    });
    Logger.log(response.getContentText());
    const data = JSON.parse(response.getContentText());
    Logger.log("Thread created: " + JSON.stringify(data));
    const THREAD_ID = data.id;
    cache.put('THREAD_ID', THREAD_ID, 21600); // Cache for 6 hours
    return `Thread created: ID: ${THREAD_ID}`;
  } catch (error) {
    Logger.log('Error creating thread:');
    Logger.log(error.toString());
    return 'Error Step 2: Create a Thread';
  }
}

function addMessage(message){
    const THREAD_ID = cache.get('THREAD_ID');
    const url_admsg = 'https://api.openai.com/v1/threads/' + THREAD_ID + '/messages';
    const headers_admsg = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + GPT_API_KEY,
      'OpenAI-Beta': 'assistants=v2'
    };
    const body_admsg = {
      'role': 'user',
      'content': message
    };

    try {
      const response_admsg = UrlFetchApp.fetch(url_admsg, {
        method: 'POST',
        headers: headers_admsg,
        payload: JSON.stringify(body_admsg),
        muteHttpExceptions: true,
        validateHttpsCertificates: false,
        followRedirects: false
      });
      Logger.log(response_admsg.getContentText());
      const data_admsg = JSON.parse(response_admsg.getContentText());
      Logger.log("Step 3: Add a Message to the Thread: " + JSON.stringify(data_admsg));
    } catch (error) {
      Logger.log('Error Step 3: Add a Message to the Thread:');
      Logger.log(error.toString());
      return 'Error Step 3: Add a Message to the Thread';
    }
}

function runThread(){
  const THREAD_ID = cache.get('THREAD_ID');
  const url_run = 'https://api.openai.com/v1/threads/' + THREAD_ID + '/runs';
  const headers_run = {
    'Authorization': 'Bearer ' + GPT_API_KEY,
    'Content-Type': 'application/json',
    'OpenAI-Beta': 'assistants=v2'
  };
  const body_run = {
    "assistant_id": ASST_ID,
  };

  try {
    const response_run = UrlFetchApp.fetch(url_run, {
      method: 'POST',
      headers: headers_run,
      payload: JSON.stringify(body_run),
      muteHttpExceptions: true,
      validateHttpsCertificates: false,
      followRedirects: false
    });
    Logger.log(response_run.getContentText());
    const data_run = JSON.parse(response_run.getContentText());
    Logger.log("Step 4: Create a Run: " + JSON.stringify(data_run));
    const RUN_ID = data_run.id;
    cache.put('RUN_ID', RUN_ID, 21600); // Cache for 6 hours
  } catch (error) {
    Logger.log('Error Step 4: Create a Run:');
    Logger.log(error.toString());
    return 'Error Step 4: Create a Run:';
  }
}

function loopByStatus(){
    const THREAD_ID = cache.get('THREAD_ID');
    const RUN_ID = cache.get('RUN_ID');

    // THREAD_IDとRUN_IDが正しくキャッシュから取得できているか確認
    if (!THREAD_ID || !RUN_ID) {
        Logger.log('Error: THREAD_ID or RUN_ID not found in cache.');
        return;
    }

    const url_runStep = 'https://api.openai.com/v1/threads/' + THREAD_ID + '/runs/' + RUN_ID + '/steps';
    const headers_runStep = {
      'Authorization': 'Bearer ' + GPT_API_KEY,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'assistants=v2'
    };

    while (true) {
      Utilities.sleep(1000); // 1秒間待機

      try {
        const response_runStep = UrlFetchApp.fetch(url_runStep, {
          method: 'GET',
          headers: headers_runStep,
          muteHttpExceptions: true,
          validateHttpsCertificates: false,
          followRedirects: false
        });
        const jsonResponse = JSON.parse(response_runStep.getContentText());

        if (jsonResponse.data && jsonResponse.data.length > 0) {
          const currentRun = jsonResponse.data[0];
          Logger.log("Step 5: Check a Run Step: " + currentRun.status);
          sslog("RunStep", currentRun.status)

          if (currentRun.status === 'completed') {
            break; // ステータスがcompletedならループを終了
          } else if (['failed', 'cancelled', 'expired'].includes(currentRun.status)) {
            Logger.log('Error: Run step status is ' + currentRun.status);
            break; // エラーステータスならループを終了
          }
        } else {
          Logger.log("Invalid response data format");
          break; // データフォーマットが無効ならループを終了
        }
      } catch (error) {
        Logger.log('Error Step 5: Check a Run Step:');
        Logger.log(error.toString());
        break; // エラーが発生したらループを終了
      }
    }
}

function generateResponseFromGPT(message) {
  Logger.log(message);

  if (message === 'sudoInitialize') {
    return createThread();
  } else {
    addMessage(message);
    runThread();
    loopByStatus();

    Utilities.sleep(1000); // 1秒間待機
    const THREAD_ID = cache.get('THREAD_ID');
    const url_msg = 'https://api.openai.com/v1/threads/' + THREAD_ID + '/messages';
    const headers_msg = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + GPT_API_KEY,
      'OpenAI-Beta': 'assistants=v2'
    };

    try {
      const response_msg = UrlFetchApp.fetch(url_msg, {
        method: 'GET',
        headers: headers_msg,
        muteHttpExceptions: true,
        validateHttpsCertificates: false,
        followRedirects: false
      });
      const messages = JSON.parse(response_msg.getContentText());

      if (messages.data && messages.data.length > 0) {
        for (const message of messages.data) {
          if (message.role === 'user') break;
          const contents = message.content;

          for (const content of contents) {
            switch (content.type) {
              case 'text':
                Logger.log(content.text.value);
                return content.text.value;
              case 'image_file':
                Logger.log('image_file', content.image_file.file_id);
                return content.image_file.file_id;
            }
          }
        }
      } else {
        Logger.log("No messages found in thread.");
        return "No messages found in thread. Thread ID is " + THREAD_ID;
      }
      Logger.log("Step 6: Show a Response: " + content.text.value);
    } catch (error) {
      Logger.log('Error Step 6: Show a Response:');
      Logger.log(error.toString());
      return "Error Step 6: Show a Response: " + error.toString();
    }
  }
}

function postMessageToSlack(channel, message) {
  var url = 'https://slack.com/api/chat.postMessage';
  var payload = {
    "channel": channel,
    "text": message
  };

  var options = {
    "method": "post",
    "contentType": "application/json",
    "headers": {
      "Authorization": "Bearer " + SLACK_BOT_TOKEN
    },
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true,
    "validateHttpsCertificates": false,
    "followRedirects": false
  };

  Logger.log("Posting message to Slack: " + JSON.stringify(payload));
  sslog("postMessageToSlack", "Posting message to Slack: " + JSON.stringify(payload));
  
  try {
    var response = UrlFetchApp.fetch(url, options);
    Logger.log("Response from Slack: " + response.getContentText());
    sslog("postMessageToSlack", "Response from Slack: " + response.getContentText());
  } catch (error) {
    Logger.log("Error posting message to Slack:");
    Logger.log(error.toString());
  }
}
