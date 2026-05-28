use super::job_queue::Job;

pub fn execute_job(job: &Job) -> String {
    format!("executed job {} ({})", job.id, job.name)
}
