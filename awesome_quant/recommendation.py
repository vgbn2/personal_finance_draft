# Jupyter notebook converted to Python script.

"""
### Recommendation System for Apna_Vaidya

"""

"""
#### 1. Rule-Based System
"""

user_profile = None
user_scenario = None

def rule_based_recommendation(user_profile, user_scenario):
    if user_scenario == 'Patient with Symptoms':
        return ["Talk to a Doctor", "Verify with a Doctor", "Symptom Checker (AI-based)"]
    elif user_scenario == 'Chronic Condition Management':
        return ["Get a Prescription", "Order Medication", "Talk to a Doctor", "Talk to a Pharmacist", "Health Coach Consultation"]
    elif user_scenario == 'New Medication Inquiry':
        return ["Talk to a Doctor", "Talk to a Pharmacist", "Medication Information (AI-based)"]
    elif user_scenario == 'Diagnostic Needs':
        return ["Connect with a Diagnostic Center", "Verify with a Doctor", "Home Sample Collection"]
    elif user_scenario == 'Prescription Refill':
        return ["Order Medication", "Get a Prescription", "Talk to a Pharmacist", "Auto-Refill Subscription"]
    elif user_scenario == 'Preventive Care':
        return ["Schedule a Check-up", "Health Coach Consultation", "Vaccination Booking"]
    elif user_scenario == 'Post-Treatment Follow-up':
        return ["Talk to a Doctor", "Schedule a Follow-up", "Physical Therapy Consultation"]
    else:
        return ["Talk to a Doctor"]


# Example usage
user_profile = 'Chronic Condition Management'
user_scenario = 'Patient with Symptoms'
recommendation = rule_based_recommendation(user_profile, user_scenario)
print(recommendation)
# Output:
#   ['Talk to a Doctor', 'Verify with a Doctor', 'Symptom Checker (AI-based)']


"""
#### 2. Collaborative Filtering
"""

import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

# Example user-item interaction matrix (rows: users, columns: options)
interaction_matrix = np.array([
    [1, 1, 0, 0, 0, 0, 0, 0, 0],  # User 1
    [0, 1, 1, 0, 0, 0, 0, 0, 0],  # User 2
    [0, 0, 1, 1, 0, 0, 0, 0, 0],  # User 3
    [0, 0, 0, 1, 1, 1, 0, 0, 0],  # User 4
    [0, 0, 0, 0, 1, 1, 1, 0, 0],  # User 5
    [0, 0, 0, 0, 0, 1, 1, 1, 0],  # User 6
])

# Calculate similarity between users
user_similarity = cosine_similarity(interaction_matrix)

# Recommend based on the most similar user's interactions
def collaborative_filtering_recommendation(user_index, interaction_matrix, user_similarity):
    similar_user_index = np.argmax(user_similarity[user_index])
    recommendations = np.where(interaction_matrix[similar_user_index] == 1)[0]
    return recommendations

# Example usage
user_index = 0  # User 1
recommendations = collaborative_filtering_recommendation(user_index, interaction_matrix, user_similarity)
print(recommendations)  # Output the indices of the recommended options

"""
#### 3. Content-Based Filtering
"""

from sklearn.feature_extraction.text import TfidfVectorizer

# Example option descriptions
options = [
    "Talk to a Doctor for immediate consultation",
    "Verify with a Doctor for second opinion",
    "Use Symptom Checker to self-diagnose",
    "Get a Prescription for chronic condition",
    "Order Medication online",
    "Talk to a Pharmacist for medication advice",
    "Health Coach Consultation for chronic condition management",
    "Medication Information for new prescriptions",
    "Medication Interaction Checker",
    "Connect with a Diagnostic Center for tests",
    "Home Sample Collection for diagnostics",
    "Book Lab Tests Online",
    "Schedule a Check-up for preventive care",
    "Health Screening Packages for preventive care",
    "Vaccination Booking for preventive care",
    "Schedule a Follow-up for post-treatment",
    "Physical Therapy Consultation for recovery",
    "Remote Monitoring Services for follow-up",
    "Talk to a Therapist for mental health support",
    "Join a Support Group for mental health",
    "Mental Health Self-assessment (AI-based)",
    "Meditation and Mindfulness Resources"
]

# User profile description
user_profile_description = "Patient with chronic condition needing regular medication and follow-ups"


# Vectorize the descriptions
vectorizer = TfidfVectorizer()
option_vectors = vectorizer.fit_transform(options)
user_vector = vectorizer.transform([user_profile_description])

similarity = cosine_similarity(user_vector, option_vectors)

# Recommend based on the highest similarity scores
def content_based_recommendation(similarity, options):
    recommendations = np.argsort(similarity[0])[::-1]
    return [options[i] for i in recommendations[:5]]

# Example usage
recommendations = content_based_recommendation(similarity, options)
print(recommendations)

"""
#### 4. Machine Learning Model
"""

# using a decision tree classifier
from sklearn.tree import DecisionTreeClassifier
from sklearn.model_selection import train_test_split

# Example dataset (features: user profile data, labels: recommended options)
# This is a simplified example; in practice, you would have a more complex dataset
X = np.array([
    [25, 1, 0, 1],  # User 1: age, chronic condition, acute symptoms, preventive care
    [45, 1, 1, 0],  # User 2
    [60, 0, 0, 1],  # User 3
    [35, 1, 0, 1],  # User 4
    [50, 0, 1, 0],  # User 5
])
y = np.array([
    [0, 1, 1, 0],  # Recommended options for User 1
    [1, 1, 0, 1],  # Recommended options for User 2
    [0, 0, 1, 1],  # Recommended options for User 3
    [1, 1, 0, 0],  # Recommended options for User 4
    [0, 0, 1, 1],  # Recommended options for User 5
])

# Split the data into training and testing sets
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Train the decision tree classifier
clf = DecisionTreeClassifier()
clf.fit(X_train, y_train)

# Predict recommendations for a new user
new_user = np.array([[40, 1, 1, 0]])  # New user profile
predictions = clf.predict(new_user)
print(predictions)
