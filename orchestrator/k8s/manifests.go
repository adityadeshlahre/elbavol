package k8s

import (
	"context"
	"fmt"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// CreateGlobalBrokerDeployment creates a deployment for the global-broker node
func CreateGlobalBrokerDeployment(clientSet *kubernetes.Clientset, namespace string) error {
	replicas := int32(1) // Single replica for global broker

	deployment := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name: "global-broker",
		},
		Spec: appsv1.DeploymentSpec{
			Replicas: &replicas,
			Selector: &metav1.LabelSelector{
				MatchLabels: map[string]string{
					"app": "global-broker",
				},
			},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: map[string]string{
						"app": "global-broker",
					},
				},
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{
						{
							Name:  "global-broker",
							Image: "your-global-broker-image:latest", // Replace with actual image
							Ports: []corev1.ContainerPort{
								{
									ContainerPort: 8080,
								},
							},
							Env: []corev1.EnvVar{
								{
									Name:  "KAFKA_URL",
									Value: "kafka-service:9092",
								},
							},
						},
					},
				},
			},
		},
	}

	_, err := clientSet.AppsV1().Deployments(namespace).Create(context.TODO(), deployment, metav1.CreateOptions{})
	if err != nil {
		return fmt.Errorf("failed to create global-broker deployment: %v", err)
	}

	return nil
}

// CreateProjectControllerDeployment creates a deployment for project-controller (per project)
func CreateProjectControllerDeployment(clientSet *kubernetes.Clientset, namespace string, projectId string) error {
	replicas := int32(1)

	deployment := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name: "project-controller-" + projectId,
		},
		Spec: appsv1.DeploymentSpec{
			Replicas: &replicas,
			Selector: &metav1.LabelSelector{
				MatchLabels: map[string]string{
					"project": projectId,
					"type":    "controller",
				},
			},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: map[string]string{
						"project": projectId,
						"type":    "controller",
					},
				},
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{
						{
							Name:  "project-controller",
							Image: "your-controller-image:latest",
							Ports: []corev1.ContainerPort{
								{
									ContainerPort: 8080,
								},
							},
							Env: []corev1.EnvVar{
								{
									Name:  "PROJECT_ID",
									Value: projectId,
								},
								{
									Name:  "KAFKA_URL",
									Value: "kafka-service:9092",
								},
							},
						},
					},
				},
			},
		},
	}

	_, err := clientSet.AppsV1().Deployments(namespace).Create(context.TODO(), deployment, metav1.CreateOptions{})
	if err != nil {
		return fmt.Errorf("failed to create project-controller deployment for %s: %v", projectId, err)
	}

	return nil
}

// CreateProjectServingDeployment creates a deployment for project-serving (per project)
func CreateProjectServingDeployment(clientSet *kubernetes.Clientset, namespace string, projectId string) error {
	replicas := int32(1)

	deployment := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name: "project-serving-" + projectId,
		},
		Spec: appsv1.DeploymentSpec{
			Replicas: &replicas,
			Selector: &metav1.LabelSelector{
				MatchLabels: map[string]string{
					"project": projectId,
					"type":    "serving",
				},
			},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: map[string]string{
						"project": projectId,
						"type":    "serving",
					},
				},
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{
						{
							Name:  "project-serving",
							Image: "your-serving-image:latest",
							Ports: []corev1.ContainerPort{
								{
									ContainerPort: 8080,
								},
							},
							Env: []corev1.EnvVar{
								{
									Name:  "PROJECT_ID",
									Value: projectId,
								},
								{
									Name:  "KAFKA_URL",
									Value: "kafka-service:9092",
								},
							},
						},
					},
				},
			},
		},
	}

	_, err := clientSet.AppsV1().Deployments(namespace).Create(context.TODO(), deployment, metav1.CreateOptions{})
	if err != nil {
		return fmt.Errorf("failed to create project-serving deployment for %s: %v", projectId, err)
	}

	return nil
}
