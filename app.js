const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

// authenticate function
const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

// Register User
app.post("/register/", async (request, response) => {
  const { username, name, password, gender } = request.body;
  const hashedPassword = await bcrypt.hash(request.body.password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (password.length < 6) {
    response.status(400);
    response.send("Password is too short");
  } else if (dbUser === undefined) {
    const createUserQuery = `
      INSERT INTO 
        user (name, username, password, gender) 
      VALUES 
        (
          '${name}',
          '${username}', 
          '${hashedPassword}', 
          '${gender}'
        )`;
    const dbResponse = await db.run(createUserQuery);
    // const newUserId = dbResponse.lastID;
    response.send("User created successfully");
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//Login User
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched) {
      const payload = { username };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//User Tweets Feed
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  let { username } = request;
  //   console.log(username);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  let { user_id } = dbUser;
  const selectTweetsQuery = `SELECT user.username, T.tweet, T.date_time AS dateTime FROM 
  (SELECT follower.following_user_id, tweet.tweet, tweet.date_time FROM follower LEFT JOIN
   tweet ON follower.following_user_id = tweet.user_id WHERE follower.follower_user_id='${user_id}') AS T
   LEFT JOIN user ON T.following_user_id = user.user_id
   ORDER BY T.date_time DESC
   LIMIT 4;`;
  const dbQuery = await db.all(selectTweetsQuery);
  response.send(dbQuery);
});

//Following Names
app.get("/user/following/", authenticateToken, async (request, response) => {
  let { username } = request;
  //   console.log(username);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  let { user_id } = dbUser;
  const selectTweetsQuery = `SELECT user.name FROM follower LEFT JOIN
  user ON follower.following_user_id = user.user_id
  where follower.follower_user_id = '${user_id}';`;
  const dbQuery = await db.all(selectTweetsQuery);
  response.send(dbQuery);
});

//Followers Names
app.get("/user/followers/", authenticateToken, async (request, response) => {
  let { username } = request;
  //   console.log(username);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  let { user_id } = dbUser;
  const selectTweetsQuery = `SELECT user.name FROM follower LEFT JOIN
  user ON follower.follower_user_id = user.user_id
  where follower.following_user_id = '${user_id}';`;
  const dbQuery = await db.all(selectTweetsQuery);
  response.send(dbQuery);
});

const checkUser = (array, userId) => {
  let flag = false;
  for (let item of array) {
    if (item.following_user_id === userId) {
      flag = true;
      return flag;
    }
  }
  return flag;
};
//Tweets by tweet Id
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  let { username } = request;
  let { tweetId } = request.params;
  //   console.log(username);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  var { user_id } = dbUser;
  const selectFollowingUsersQuery = `SELECT following_user_id FROM follower WHERE follower_user_id = '${user_id}';`;
  const followingUsersArray = await db.all(selectFollowingUsersQuery);
  //   console.log(FollowingUsers);

  const selectTweetedUserQuery = `SELECT * FROM tweet WHERE tweet_id = '${tweetId}';`;
  const tweetedUser = await db.get(selectTweetedUserQuery);
  var { user_id } = tweetedUser;
  if (checkUser(followingUsersArray, user_id)) {
    const selectTweetDetailsQuery = `SELECT tweet, (SELECT COUNT(like_id) FROM like
    WHERE tweet_id = ${tweetId}) AS likes, (SELECT COUNT(reply_id) FROM reply
    WHERE tweet_id = ${tweetId}) AS replies, date_time AS dateTime FROM tweet WHERE tweet.tweet_id = ${tweetId};`;
    const dbQuery = await db.all(selectTweetDetailsQuery);
    response.send(dbQuery);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//Likes of Tweet
app.get(
  "/tweets/:tweetId/likes",
  authenticateToken,
  async (request, response) => {
    let { username } = request;
    let { tweetId } = request.params;
    //   console.log(username);
    const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
    const dbUser = await db.get(selectUserQuery);
    var { user_id } = dbUser;
    const selectFollowingUsersQuery = `SELECT following_user_id FROM follower WHERE follower_user_id = '${user_id}';`;
    const followingUsersArray = await db.all(selectFollowingUsersQuery);
    //   console.log(FollowingUsers);

    const selectTweetedUserQuery = `SELECT * FROM tweet WHERE tweet_id = '${tweetId}';`;
    const tweetedUser = await db.get(selectTweetedUserQuery);
    var { user_id } = tweetedUser;
    if (checkUser(followingUsersArray, user_id)) {
      const selectLikedUserNameQuery = `SELECT name FROM user WHERE user_id IN (SELECT user_id FROM like where tweet_id = ${tweetId}) ORDER BY name ASC`;
      const likedUsersDbArray = await db.all(selectLikedUserNameQuery);
      const likedUsersResponseArray = likedUsersDbArray.map((eachItem) => {
        return eachItem.name;
      });
      response.send({ likes: likedUsersResponseArray });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//Replies of Tweet
app.get(
  "/tweets/:tweetId/replies",
  authenticateToken,
  async (request, response) => {
    let { username } = request;
    let { tweetId } = request.params;
    //   console.log(username);
    const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
    const dbUser = await db.get(selectUserQuery);
    var { user_id } = dbUser;
    const selectFollowingUsersQuery = `SELECT following_user_id FROM follower WHERE follower_user_id = '${user_id}';`;
    const followingUsersArray = await db.all(selectFollowingUsersQuery);
    //   console.log(FollowingUsers);

    const selectTweetedUserQuery = `SELECT * FROM tweet WHERE tweet_id = '${tweetId}';`;
    const tweetedUser = await db.get(selectTweetedUserQuery);
    var { user_id } = tweetedUser;
    if (checkUser(followingUsersArray, user_id)) {
      const selectRepliedUserNameQuery = `SELECT user.name, reply.reply FROM 
      reply LEFT JOIN user ON reply.user_id=user.user_id where reply.tweet_id = ${tweetId}`;
      const repliedUsersDbArray = await db.all(selectRepliedUserNameQuery);
      //   console.log(repliedUsersDbArray);
      response.send({ replies: repliedUsersDbArray });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//user Tweets
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  let { username } = request;
  //   console.log(username);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  let { user_id } = dbUser;
  const selectTweetsQuery = `SELECT T.tweet, COUNT(T.like_id) AS likes, COUNT(reply.reply_id) AS replies, T.date_time AS dateTime 
  FROM (SELECT * from tweet LEFT JOIN like ON tweet.tweet_id = like.tweet_id) as T
  LEFT JOIN reply on T.tweet_id = reply.tweet_id WHERE T.user_id = '${user_id}' GROUP BY T.tweet_id;`;
  const dbQuery = await db.all(selectTweetsQuery);
  response.send(dbQuery);
});
module.exports = app;
