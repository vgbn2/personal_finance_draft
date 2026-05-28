#[derive(Debug, Clone)]
pub struct Job {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Default)]
pub struct JobQueue {
    pub jobs: Vec<Job>,
}

impl JobQueue {
    pub fn push(&mut self, job: Job) {
        self.jobs.push(job);
    }
}
