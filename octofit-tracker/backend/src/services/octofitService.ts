import mongoose from 'mongoose';
import { Activity, Team, User, Workout } from '../models/index.js';

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, `${field} is required`);
  }
  return value.trim();
}

function objectId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !mongoose.isObjectIdOrHexString(value)) {
    throw new HttpError(400, `${field} must be a valid ID`);
  }
  return value;
}

export async function listActivities() {
  return Activity.find().lean();
}

export async function createActivity(input: unknown) {
  if (!isRecord(input)) throw new HttpError(400, 'Activity data must be an object');
  const userId = objectId(input.userId, 'userId');
  const teamId = objectId(input.teamId, 'teamId');
  const type = requiredString(input.type, 'type');
  const minutes = input.minutes;
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 1) {
    throw new HttpError(400, 'minutes must be a positive number');
  }

  const [user, team] = await Promise.all([
    User.exists({ _id: userId }),
    Team.exists({ _id: teamId }),
  ]);
  if (!user || !team) throw new HttpError(404, 'User or team not found');

  return Activity.create({
    user: userId,
    team: teamId,
    type,
    minutes,
    points: minutes,
    occurredAt: new Date(),
  });
}

export async function listTeams() {
  return Team.find().lean();
}

export async function createTeam(input: unknown) {
  if (!isRecord(input)) throw new HttpError(400, 'Team data must be an object');
  const name = requiredString(input.name, 'name');
  const mascot = requiredString(input.mascot, 'mascot');
  if (input.members !== undefined && !Array.isArray(input.members)) {
    throw new HttpError(400, 'members must be an array of user IDs');
  }

  const memberIds = [...new Set((input.members ?? []).map((member, index) => objectId(member, `members[${index}]`)))];
  const existingMembers = memberIds.length
    ? await User.find({ _id: { $in: memberIds } }).select('_id').lean()
    : [];
  if (existingMembers.length !== memberIds.length) {
    throw new HttpError(404, 'One or more team members were not found');
  }

  return Team.create({ name, mascot, members: memberIds });
}

export async function getLeaderboard() {
  const [teams, pointTotals] = await Promise.all([
    Team.find().select('name').lean(),
    Activity.aggregate<{ _id: mongoose.Types.ObjectId; totalPoints: number }>([
      { $group: { _id: '$team', totalPoints: { $sum: '$points' } } },
    ]),
  ]);
  const pointsByTeam = new Map(pointTotals.map(({ _id, totalPoints }) => [_id.toString(), totalPoints]));

  return teams
    .map((team) => ({
      teamName: team.name,
      totalPoints: pointsByTeam.get(team._id.toString()) ?? 0,
    }))
    .sort((left, right) => right.totalPoints - left.totalPoints || left.teamName.localeCompare(right.teamName))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function focusForActivity(type: string): string {
  const normalizedType = type.trim().toLowerCase();
  const focusByActivity = new Map([
    ['run', 'endurance'],
    ['walk', 'endurance'],
    ['cycle', 'endurance'],
    ['swim', 'endurance'],
    ['strength', 'strength'],
    ['weightlifting', 'strength'],
    ['yoga', 'mobility'],
    ['stretch', 'mobility'],
  ]);
  return focusByActivity.get(normalizedType) ?? normalizedType;
}

export async function suggestWorkouts(userEmail: string) {
  const user = await User.findOne({ email: userEmail.trim().toLowerCase() })
    .select('_id fitnessGoal')
    .lean();
  if (!user) throw new HttpError(404, 'User not found');

  const [recentActivity, workouts] = await Promise.all([
    Activity.findOne({ user: user._id }).sort({ occurredAt: -1, _id: -1 }).select('type').lean(),
    Workout.find().lean(),
  ]);
  const goalFocus = user.fitnessGoal.trim().toLowerCase();
  const recentFocus = recentActivity ? focusForActivity(recentActivity.type) : undefined;
  const availableFocuses = new Set(workouts.map((workout) => workout.focus.trim().toLowerCase()));
  const preferredFocus = availableFocuses.has(goalFocus)
    ? goalFocus
    : recentFocus && availableFocuses.has(recentFocus)
      ? recentFocus
      : undefined;

  if (!preferredFocus) return [];

  const sortedWorkouts = [...workouts].sort((left, right) => {
    const focusOrder = Number(right.focus.trim().toLowerCase() === preferredFocus)
      - Number(left.focus.trim().toLowerCase() === preferredFocus);
    return focusOrder || left.title.localeCompare(right.title);
  });
  const reason = preferredFocus === goalFocus
    ? recentActivity && recentFocus === preferredFocus
      ? `Matches your ${user.fitnessGoal} goal and recent ${recentActivity.type} activity.`
      : `Matches your ${user.fitnessGoal} fitness goal.`
    : `Recommended based on your recent ${recentActivity?.type} activity.`;

  return sortedWorkouts.map((workout, index) => ({
    ...workout,
    reason: index === 0 ? reason : `An alternative with a ${workout.focus} focus.`,
  }));
}

export { User };
