//requirements
require("dotenv").config();
const _ = require("lodash");
const express = require("express");
const app = express();
const mongoose = require("mongoose");
const moment = require("moment-jalaali");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const bcrypt = require("bcryptjs");
const flash = require("express-flash");
const session = require("express-session");
const path = require("path");
const multer = require("multer");
const storage = multer.diskStorage({
    destination: function(req, file, cb){
        cb(null, __dirname + "/pics");
    },
    filename: function(req, file, cb){
        cb(null, file.fieldname + "-" + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({
    storage: storage
});

//mongoose models
const adminSchema = new mongoose.Schema({
    admin_username: String,
    admin_password: String,
});
const Admin = mongoose.model("admin", adminSchema);

const examSchema = new mongoose.Schema({
    exam_id: Number, //1, 2, 3, ...
    exam_title: String,
    exam_description: String,
    exam_time: Number, //in minutes
    exam_questions: [{
        exam_question_title: String,
        exam_question_pic: String,
        exam_question_answer1: String,
        exam_question_answer2: String,
        exam_question_answer3: String,
        exam_question_answer4: String,
        exam_question_considered: Boolean,
    }],
    exam_key: [Number],
    exam_active: Boolean,
});
const Exam = mongoose.model("exam", examSchema);

const participantSchema = new mongoose.Schema({
    participant_id: Number, //also the end_time
    participant_exam_id: Number,
    participant_start_time: Number,
    participant_answers: [Number],
    participant_first_name: String,
    participant_last_name: String,
    participant_age: Number,
    participant_considered: Boolean,
    participant_ip: String,
});
const Participant = mongoose.model("participant", participantSchema);

//passport config
passport.use(
    new LocalStrategy(
        {
            usernameField: "username",
            passwordField: "password"
        },
        function(username, password, done){
            Admin.findOne({admin_username: username}, function(err, foundAdmin){
                if(!foundAdmin){
                    return done(null, false, {
                        message: "کاربر یافت نشد."
                    });
                }else{
                    bcrypt.compare(password, foundAdmin.admin_password, function(err, result){
                        if(result === true){
                            return done(null, foundAdmin);
                        }else{
                            return done(null, false, {
                                message: "رمز عبور اشتباه است."
                            });
                        }
                    });
                }
            });
        }
    )
);
passport.serializeUser(function(admin, done){
    done(null, admin.admin_username);
});
passport.deserializeUser(function(adminUsername, done){
    Admin.findOne({admin_username: adminUsername}, function(err, foundAdmin){
        return done(null, foundAdmin);
    });
});

//express config
app.set("view engine", "ejs");
moment.loadPersian();
app.use("/", express.static("public"));
app.use("/pics", express.static("pics"));

app.use(express.urlencoded({
    extended: true
}));
app.use(flash());
app.use(session({
    secret: process.env.EXPRESS_SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());
mongoose.set("strictQuery", false);
mongoose.connect(
    process.env.MONGODB_URL,
    {
        useNewUrlParser: true,
        useUnifiedTopology: true
    }
);

//express routes
app.get("/", function(req, res){
    Exam.find({exam_active: true}, function(err, activeExams){
        res.render("index", {
            adminLoggedIn: req.isAuthenticated(),
            topCornerDate: moment(new Date()).format("dddd jD jMMMM jYYYY"),
            activeExams: activeExams
        });
    });
});

app.get("/take", function(req, res){
    if(req.query.id){
        Exam.findOne({exam_id: req.query.id}, function(err, foundExam){
            if(foundExam){
                if(foundExam.exam_active){
                    res.render("take", {
                        adminLoggedIn: req.isAuthenticated(),
                        foundExam: foundExam,
                        startTime: new Date().getTime()
                    });
                }else{
                    res.render("msg", {
                        adminLoggedIn: req.isAuthenticated(),
                        messageTitle: "خطا در اجرای آزمون",
                        messageDescription: "این آزمون غیرفعال شده و در حال حاضر پاسخ جدید دریافت نمی‌کند."
                    });
                }
            }else{
                res.render("msg", {
                    adminLoggedIn: req.isAuthenticated(),
                    messageTitle: "خطا در اجرای آزمون",
                    messageDescription: "آزمونی با این آی دی وجود ندارد."
                });
            }
        });
    }else{
        res.render("msg", {
            adminLoggedIn: req.isAuthenticated(),
            messageTitle: "خطا در اجرای آزمون",
            messageDescription: "وارد کردن پارامتر آی دی الزامی است."
        });
    }
});

app.post("/take", function(req, res){
    if(req.query.id){
        Exam.findOne({exam_id: req.query.id}, function(err, foundExam){
            if(foundExam){

                let participantAnswers = [];
                req.body.question.forEach(function(itemAnswer, indexAnswer){
                    participantAnswers.push(itemAnswer.answer ? itemAnswer.answer : 0);
                });

                const participant = new Participant({
                    participant_id: new Date().getTime(),
                    participant_exam_id: req.query.id,
                    participant_start_time: req.body.start,
                    participant_answers: participantAnswers,
                    participant_first_name: req.body.fname,
                    participant_last_name: req.body.lname,
                    participant_age: req.body.age,
                    participant_considered: true,
                    participant_ip: req.headers['x-forwarded-for']
                });
                participant.save(function(err, savedParticipant){
                    res.redirect("/examresult?id=" + savedParticipant.participant_id);
                });
            }else{
                res.render("msg", {
                    adminLoggedIn: req.isAuthenticated(),
                    messageTitle: "خطا در اجرای آزمون",
                    messageDescription: "آزمونی با این آی دی وجود ندارد."
                });
            }
        });
    }else{
        res.render("msg", {
            adminLoggedIn: req.isAuthenticated(),
            messageTitle: "خطا در اجرای آزمون",
            messageDescription: "وارد کردن پارامتر آی دی الزامی است."
        });
    }
});

app.get("/print", function(req, res){
    if(req.query.id){
        Exam.findOne({exam_id: req.query.id}, function(err, foundExam){
            if(foundExam){
                if(foundExam.exam_active){
                    res.render("print", {
                        foundExam: foundExam
                    });
                }else{
                    res.render("msg", {
                        adminLoggedIn: req.isAuthenticated(),
                        messageTitle: "خطا در نمایش آزمون",
                        messageDescription: "این آزمون غیرفعال شده و در حال حاضر قابل چاپ نیست."
                    });
                }
            }else{
                res.render("msg", {
                    adminLoggedIn: req.isAuthenticated(),
                    messageTitle: "خطا در نمایش آزمون",
                    messageDescription: "آزمونی با این آی دی وجود ندارد."
                });
            }
        });
    }else{
        res.render("msg", {
            adminLoggedIn: req.isAuthenticated(),
            messageTitle: "خطا در نمایش آزمون",
            messageDescription: "وارد کردن پارامتر آی دی الزامی است."
        });
    }
});

app.get("/examresult", function(req, res){
    if(!req.query.id){
        res.render("msg", {
            adminLoggedIn: req.isAuthenticated(),
            messageTitle: "خطا",
            messageDescription: "وارد کردن شماره رهگیری الزامی است."
        });
    }else{

        Participant.findOne({participant_id: req.query.id}, function(err, foundParticipant){
            if(!foundParticipant){
                res.render("msg", {
                    adminLoggedIn: req.isAuthenticated(),
                    messageTitle: "خطا",
                    messageDescription: "آزمونی با این شماره رهگیری یافت نشد."
                });
            }else{
                Exam.findOne({exam_id: foundParticipant.participant_exam_id}, function(err, participantExam){
                    res.render("examresult", {
                        adminLoggedIn: req.isAuthenticated(),
                        foundParticipant: foundParticipant,
                        examKey: participantExam.exam_key,
                        moment: moment,
                        deltaTimeInFarsi: deltaTimeInFarsi,
                        examQuestions: participantExam.exam_questions,
                        examScoring: examScoring
                    });
                });
            }
        });
    }
});

app.get("/tracking", function(req, res){
    res.render("tracking", {
        adminLoggedIn: req.isAuthenticated()
    });
});

app.post("/tracking", function(req, res){
    if(!req.body.code){
        res.render("msg", {
            adminLoggedIn: req.isAuthenticated(),
            messageTitle: "خطا",
            messageDescription: "وارد کردن شماره رهگیری الزامی است."
        });
    }else{

        Participant.findOne({participant_id: req.body.code}, function(err, foundParticipant){
            if(!foundParticipant){
                res.render("msg", {
                    adminLoggedIn: req.isAuthenticated(),
                    messageTitle: "خطا",
                    messageDescription: "آزمونی با این شماره رهگیری یافت نشد."
                });
            }else{
                Exam.findOne({exam_id: foundParticipant.participant_exam_id}, function(err, participantExam){
                    res.render("trackingresult", {
                        adminLoggedIn: req.isAuthenticated(),
                        examTitle: participantExam.exam_title,
                        foundParticipant: foundParticipant,
                        examKey: participantExam.exam_key,
                        moment: moment,
                        deltaTimeInFarsi: deltaTimeInFarsi,
                        examQuestions: participantExam.exam_questions,
                        examScoring: examScoring
                    });
                });
            }
        });
    }
});

app.get("/login", function(req, res){
    if(req.isAuthenticated()){
        res.redirect("/admin");
    }else{
        Admin.findOne(null, function(err, anyAdmin){
            if(!anyAdmin){
                //generate a new admin user based on env variables
                bcrypt.hash(process.env.ADMIN_PASSWORD, 10, function(err, hash){
                    const admin = new Admin({
                        admin_username: process.env.ADMIN_USERNAME,
                        admin_password: hash
                    });
                    admin.save(function(err){
                        res.render("msg", {
                            adminLoggedIn: false,
                            messageTitle: "اکانت مدیر",
                            messageDescription: "اکانت مدیر با اطلاعات وارد شده در متغیرهای محلی برنامه با موفقیت ایجاد شد."
                        });
                    });
                });
            }else{
                res.render("login", {
                    adminLoggedIn: req.isAuthenticated()
                });
            }
        });
    }
});

app.post("/login", passport.authenticate("local", {
    successRedirect: "/admin",
    failureRedirect: "/login",
    failureFlash: true
}));

app.get("/admin", function(req, res){
    if(req.isAuthenticated()){
        Exam.find(null, function(err, allExams){
            Participant.find(null, function(err, allParticipants){

                let consideredPs = {};
                let unconsideredPs = {};

                allExams.forEach(function(itemExam, indexExam){
                    consideredPs[itemExam.exam_id] = 0;
                    unconsideredPs[itemExam.exam_id] = 0;
                });

                allParticipants.forEach(function(itemParticipant, indexParticipant){
                    if(itemParticipant.participant_considered){
                        consideredPs[itemParticipant.participant_exam_id] = consideredPs[itemParticipant.participant_exam_id] + 1;
                    }else{
                        unconsideredPs[itemParticipant.participant_exam_id] = unconsideredPs[itemParticipant.participant_exam_id] + 1;
                    }
                });

                res.render("admin", {
                    adminLoggedIn: true,
                    allExams: allExams,
                    consideredPs: consideredPs,
                    unconsideredPs: unconsideredPs
                });
            });
        });
    }else{
        res.redirect("/login");
    }
});

app.get("/changepass", function(req, res){
    if(req.isAuthenticated()){
        res.render("changepass", {
            adminLoggedIn: true
        });
    }else{
        res.redirect("/login");
    }
});

app.post("/changepass", function(req, res){
    if(req.isAuthenticated()){
        if(req.body.password && req.body.password2){
            if(req.body.password == req.body.password2){
                bcrypt.hash(req.body.password, 10, function(err, hash){
                    Admin.updateOne({admin_username: req.user.admin_username}, {admin_password: hash}, function(err){
                        req.logOut(function(err){
                            res.render("msg", {
                                adminLoggedIn: false,
                                messageTitle: "تغییر رمز موفق",
                                messageDescription: "رمز عبور با موفقیت تغییر کرد. لطفا مجدد وارد سامانه شوید."
                            });
                        });
                    });
                });
            }else{
                res.render("msg", {
                    adminLoggedIn: true,
                    messageTitle: "خطا در تغییر رمز عبور",
                    messageDescription: "رمز عبور و تکرار آن مغایرت دارند."
                });
            }
        }else{
            res.render("msg", {
                adminLoggedIn: true,
                messageTitle: "خطا در تغییر رمز عبور",
                messageDescription: "وارد کردن هر دو فیلد رمز عبور جدید و تکرار آن الزامی است."
            });
        }
    }else{
        res.redirect("/login");
    }
});

app.get("/newexam", function(req, res){
    if(req.isAuthenticated()){
        res.render("newexam", {
            adminLoggedIn: true
        });
    }else{
        res.redirect("/login");
    }
});

var uploadFields = upload.any("pic");
app.post("/newexam", uploadFields, function(req, res){
    if(req.isAuthenticated()){
        Exam.countDocuments(null, function(err, examsCount){

            let questionsModified = [];
            req.body.question.forEach(function(itemQuestion, indexQuestion){
                questionsModified.push({
                    exam_question_title: itemQuestion.title ? itemQuestion.title : undefined,
                    exam_question_pic: _.find(req.files, {fieldname: "pic["+indexQuestion+"]"}) ?
                        _.find(req.files, {fieldname: "pic["+indexQuestion+"]"}).filename : undefined,
                    exam_question_answer1: itemQuestion.option1,
                    exam_question_answer2: itemQuestion.option2,
                    exam_question_answer3: itemQuestion.option3,
                    exam_question_answer4: itemQuestion.option4,
                    exam_question_considered: true
                });
            });
    
            const exam = new Exam({
                exam_id: examsCount + 1,
                exam_title: req.body.title,
                exam_description: req.body.description,
                exam_time: req.body.time,
                exam_questions: questionsModified,
                exam_key: req.body.key,
                exam_active: true
            });
            exam.save(function(err){
                // res.render("msg", {
                //     adminLoggedIn: true,
                //     messageTitle: "افزودن آزمون موفق",
                //     messageDescription: "آزمون با موفقیت به سامانه اضافه شد."
                // });
                res.redirect("/admin");
            });
        });
    }else{
        res.redirect("/login");
    }
});

app.get("/toggle", function(req, res){
    if(req.isAuthenticated()){
        if(req.query.id){
            Exam.findOne({exam_id: req.query.id}, function(err, foundExam){
                if(foundExam){
                    Exam.updateOne({exam_id: req.query.id}, {exam_active: !foundExam.exam_active}, function(err){
                        res.redirect("/admin");
                    });
                }else{
                    res.redirect("/admin");
                }
            });
        }else{
            res.redirect("/admin");
        }
    }else{
        res.redirect("/login");
    }
});

app.get("/toggleparticipant", function(req, res){
    if(req.isAuthenticated()){
        if(req.query.id){
            Participant.findOne({participant_id: req.query.id}, function(err, foundParticipant){
                if(foundParticipant){
                    Participant.updateOne({participant_id: req.query.id}, {participant_considered: !foundParticipant.participant_considered}, function(err){
                        res.redirect("/analysis?id=" + foundParticipant.participant_exam_id + "#participants");
                    });
                }else{
                    res.redirect("/admin");
                }
            });
        }else{
            res.redirect("/admin");
        }
    }else{
        res.redirect("/login");
    }
});

app.get("/analysis", function(req, res){
    if(req.isAuthenticated()){
        if(!req.query.id){
            res.render("msg", {
                adminLoggedIn: req.isAuthenticated(),
                messageTitle: "خطا",
                messageDescription: "وارد کردن آی دی آزمون الزامی است."
            });
        }else{
            Exam.findOne({exam_id: req.query.id}, function(err, foundExam){
                if(!foundExam){
                    res.render("msg", {
                        adminLoggedIn: req.isAuthenticated(),
                        messageTitle: "خطا",
                        messageDescription: "آزمونی با این آی دی یافت نشد."
                    });
                }else{
                    //count number of considered questions
                    let consideredQs = 0;
                    foundExam.exam_questions.forEach(function(itemQuestion, indexQuestion){
                        if(itemQuestion.exam_question_considered){
                            consideredQs ++;
                        }
                    });
                    Participant.find({participant_exam_id: foundExam.exam_id}, function(err, examParticipants){

                        Participant.countDocuments(
                            {
                                $and: [
                                    {participant_exam_id: foundExam.exam_id},
                                    {participant_considered: true}
                                ]
                            },
                            
                            function(err, consideredCount){

                                Participant.find({
                                    $and: [
                                        {participant_exam_id: foundExam.exam_id},
                                        {participant_considered: true}
                                    ]
                                }, function(err, activeParticipants){

                                    let timeMean = _.chain(activeParticipants)
                                        .map((ap) => ap.participant_id - ap.participant_start_time)
                                        .mean()
                                        .value();

                                    let ageMean = _.chain(activeParticipants)
                                        .map((ap) => ap.participant_age)
                                        .mean()
                                        .round(4)
                                        .value();

                                    let maxScore = _.chain(activeParticipants)
                                        .map((ap) => examScoring(ap.participant_answers, foundExam.exam_key, foundExam.exam_questions)[3])
                                        .max()
                                        .value();

                                    let minScore = _.chain(activeParticipants)
                                        .map((ap) => examScoring(ap.participant_answers, foundExam.exam_key, foundExam.exam_questions)[3])
                                        .min()
                                        .value();

                                    let meanScore = _.chain(activeParticipants)
                                        .map((ap) => examScoring(ap.participant_answers, foundExam.exam_key, foundExam.exam_questions)[3])
                                        .mean()
                                        .round(4)
                                        .value();

                                    let variance = _.chain(activeParticipants)
                                        .map((ap) => Math.pow((examScoring(ap.participant_answers, foundExam.exam_key, foundExam.exam_questions)[3] - meanScore), 2))
                                        .sum()
                                        .divide(activeParticipants.length - 1)
                                        .round(4)
                                        .value();

                                    let kr21 = (consideredQs / (consideredQs - 1)) * ( 1 - ((meanScore * (consideredQs-meanScore))/(consideredQs*variance)) );
                                    let kr21rounded = _.round(kr21, 4);

                                    let questionStatus = [];
                                    let barChartData = [];

                                    foundExam.exam_questions.forEach(function(itemAnswer, indexAnswer){

                                        let correctAns = 0;
                                        let totalAns = 0;
                                        let itemFacility = 0;
                                        let difficulty = 0;

                                        let omitsCount = 0;
                                        let op1Count = 0;
                                        let op2Count = 0;
                                        let op3Count = 0;
                                        let op4Count = 0;

                                        activeParticipants.forEach(function(itemParticipant, indexParticipant){
                                            totalAns++;
                                            if(itemParticipant.participant_answers[indexAnswer] == foundExam.exam_key[indexAnswer]){
                                                correctAns++;
                                            }

                                            if(itemParticipant.participant_answers[indexAnswer] == 0){
                                                omitsCount++;
                                            }else if(itemParticipant.participant_answers[indexAnswer] == 1){
                                                op1Count++;
                                            }else if(itemParticipant.participant_answers[indexAnswer] == 2){
                                                op2Count++;
                                            }else if(itemParticipant.participant_answers[indexAnswer] == 3){
                                                op3Count++;
                                            }else if(itemParticipant.participant_answers[indexAnswer] == 4){
                                                op4Count++;
                                            }
                                        });

                                        itemFacility = _.round((correctAns / totalAns), 4);
                                        difficulty = _.round((1 - itemFacility), 4);

                                        questionStatus.push({
                                            correct_considered_answers: correctAns,
                                            total_considered_answers: totalAns,
                                            item_facility: itemFacility,
                                            difficulty: difficulty
                                        });

                                        markerColors = ["#000000", "#000000", "#000000", "#000000", "#000000"];
                                        //change the correct answer marker color to green
                                        markerColors[foundExam.exam_key[indexAnswer]] = "#198754";

                                        barChartData.push([{
                                            x: ["Omits", "Option 1", "Option 2", "Option 3", "Option 4"],
                                            y: [omitsCount, op1Count, op2Count, op3Count, op4Count],
                                            marker: {
                                                color: markerColors
                                            },
                                            type: "bar"
                                        }]);
                                    });

                                    res.render("analysis", {
                                        adminLoggedIn: true,
                                        foundExam: foundExam,
                                        consideredQs: consideredQs,
                                        examParticipants: examParticipants,
                                        consideredCount: consideredCount,
                                        msInFarsi: msInFarsi,
                                        timeMean: timeMean,
                                        ageMean: ageMean,
                                        maxScore: maxScore,
                                        minScore: minScore,
                                        meanScore: meanScore,
                                        variance: variance,
                                        kr21rounded: kr21rounded,
                                        examScoring: examScoring,
                                        moment: moment,
                                        deltaTimeInFarsi: deltaTimeInFarsi,
                                        questionStatus: questionStatus,
                                        barChartData: barChartData
                                    });
                                });

                            }
                        );

                    });

                }
            });
        }
    }else{
        res.redirect("/login");
    }
});

app.get("/togglequestion", function(req, res){
    if(req.isAuthenticated()){
        //id = exam_id, no = question number in exam
        if(req.query.id){
            Exam.findOne({exam_id: req.query.id}, function(err, foundExam){
                if(foundExam){
                    if(req.query.no){
                        if(!isNaN(req.query.no)){
                            if(req.query.no < foundExam.exam_questions.length && req.query.no >= 0){
                                let tempQuestionsHolder = foundExam.exam_questions;

                                //alter the question with specific no
                                tempQuestionsHolder[req.query.no].exam_question_considered =
                                    !tempQuestionsHolder[req.query.no].exam_question_considered;

                                //update the database accordingly
                                Exam.updateOne({exam_id: foundExam.exam_id}, {exam_questions: tempQuestionsHolder}, function(err){
                                    res.redirect("/analysis?id=" + foundExam.exam_id + "#question-" + req.query.no);
                                });

                            }else{
                                res.redirect("/analysis?id=" + foundExam.exam_id);
                            }
                        }else{
                            res.redirect("/analysis?id=" + foundExam.exam_id);
                        }
                    }else{
                        res.redirect("/analysis?id=" + foundExam.exam_id);
                    }
                }else{
                    res.redirect("/analysis?id=" + foundExam.exam_id);
                }
            });
        }else{
            res.redirect("/admin");
        }
    }else{
        res.redirect("/login");
    }
});


app.get("/logout", function(req, res){
    req.logOut(function(err){
        res.redirect("/login");
    });
});

app.get("/404", function(req, res){
    res.render("msg", {
        adminLoggedIn: req.isAuthenticated(),
        messageTitle: "خطای 404",
        messageDescription: "صفحه موردنظر وجود ندارد."
    });
});

app.get("*", function(req, res){
    res.redirect("/404");
});

//express init
app.listen(process.env.PORT, function(){
    console.log("TEFL-EXAM is running on port " + process.env.PORT);
});

function deltaTimeInFarsi(endTime, startTime){
    
    //calculate the delta time in seconds
    let deltaTime = Math.floor((endTime - startTime) / 1000);

    let deltaTimeSeconds = deltaTime % 60;
    let deltaTimeMinutes = (deltaTime - deltaTimeSeconds) / 60;

    if(deltaTimeMinutes == 0){
        return deltaTimeSeconds + " ثانیه";
    }else{
        if(deltaTimeSeconds == 0){
            return deltaTimeMinutes + " دقیقه";
        }else{
            return deltaTimeMinutes + " دقیقه و " + deltaTimeSeconds + " ثانیه";
        }
    }
}

function msInFarsi(msTime){
    let numericTime = Math.floor(msTime/1000);

    let numericTimeSeconds = numericTime % 60;
    let numericTimeMinutes = (numericTime - numericTimeSeconds) / 60;

    if(numericTimeMinutes == 0){
        return numericTimeSeconds + " ثانیه";
    }else{
        if(numericTimeSeconds == 0){
            return numericTimeMinutes + " دقیقه";
        }else{
            return numericTimeMinutes + " دقیقه و " + numericTimeSeconds + " ثانیه";
        }
    }
}

function examScoring(participantAns, keyAns, examQuestions){
    
    let rightAnswers = 0;
    let wrongAnswers = 0;
    let omits = 0;

    let invalidQuestions = 0;
    
    for(let i=0; i<keyAns.length; i++){
        if(examQuestions[i].exam_question_considered){
            if(participantAns[i] == 0){
                omits++;
            }else if(participantAns[i] == keyAns[i]){
                rightAnswers++;
            }else if(participantAns[i] != keyAns[i]){
                wrongAnswers++;
            }
        }else{
            invalidQuestions++;
        }
    }

    let scoreFormula = Math.floor((rightAnswers / (keyAns.length - invalidQuestions)) * 100);
    
    return [rightAnswers, wrongAnswers, omits, scoreFormula, invalidQuestions];
}