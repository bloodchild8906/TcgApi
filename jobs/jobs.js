const schedule = require('node-schedule');

let initialized = false;
const scheduledJobs = [];

const logJobError = (label, error) => {
  console.error(`Scheduled job failed: ${label}`, error);
};

const runJob = async (label, handler) => {
  try {
    await Promise.resolve(handler());
  } catch (error) {
    logJobError(label, error);
  }
};

const executeHourlyJobs = async () => {
  console.log('Run Hourly Jobs.....');
  // Add custom hourly jobs here.
};

const executeDailyJobs = async () => {
  console.log('Run Daily Jobs.....');
  // Add custom daily jobs here.
};

const executeWeeklyJobs = async () => {
  console.log('Run Weekly Jobs.....');
  // Add custom weekly jobs here.
};

const executeMonthlyJobs = async () => {
  console.log('Run Monthly Jobs.....');
  // Add custom monthly jobs here.
};

const executeYearlyJobs = async () => {
  console.log('Run Yearly Jobs.....');
  // Add custom yearly jobs here.
};

const registerJob = (cron, label, handler) => {
  const job = schedule.scheduleJob(cron, () => {
    runJob(label, handler);
  });

  scheduledJobs.push(job);
};

exports.InitJobs = () => {
  if (initialized) {
    return;
  }

  initialized = true;

  registerJob('0 * * * *', 'hourly', executeHourlyJobs);
  registerJob('0 0 * * *', 'daily', executeDailyJobs);
  registerJob('0 0 * * 0', 'weekly', executeWeeklyJobs);
  registerJob('0 0 1 * *', 'monthly', executeMonthlyJobs);
  registerJob('0 0 1 1 *', 'yearly', executeYearlyJobs);

  runJob('startup-hourly', executeHourlyJobs);
};

exports.StopJobs = () => {
  while (scheduledJobs.length > 0) {
    const job = scheduledJobs.pop();
    if (job && typeof job.cancel === 'function') {
      job.cancel();
    }
  }

  initialized = false;
};
