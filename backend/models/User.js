import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    phone: {
        type: String,
        trim: true,
        default: ""
    },
    role: {
        type: String,
        enum: ["user", "admin"],
        default: "user"
    },
    coins: {
        type: Number,
        default: 0
    },
    isBanned: {
        type: Boolean,
        default: false
    },
    referralCode: {
        type: String,
        unique: true,
        sparse: true,
        trim: true
    },
    referredByPaid: {
        type: Boolean,
        default: false
    },
    hasGeneratedCode: {
        type: Boolean,
        default: false
    },
    referredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    },
    isReferralKing: {
        type: Boolean,
        default: false
    },
    referralKingSince: {
        type: Date,
        default: null
    },
    weeklyReferralCount: {
        type: Number,
        default: 0
    },
    lastDailyClaim: {
        type: Date,
        default: null
    },
    dailyClaimCount: {
        type: Number,
        default: 0
    },
    badges: {
        type: [String],
        default: ["pioneer"] // All new users get Pioneer automatically
    },
    isVIP: {
        type: Boolean,
        default: false
    },
    totalDeployments: {
        type: Number,
        default: 0
    },
    totalReferrals: {
        type: Number,
        default: 0
    },
    totalReferralCoinsEarned: {
        type: Number,
        default: 0
    },
    totalCoinsSpent: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Hash password before saving
userSchema.pre("save", async function () {
    if (!this.isModified("password")) return;
    this.password = await bcrypt.hash(this.password, 12);
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

// Don't return password in JSON
userSchema.methods.toJSON = function () {
    const obj = this.toObject();
    delete obj.password;
    return obj;
};

const User = mongoose.model("User", userSchema);
export default User;
