package k8s

import (
	"context"
	"fmt"
	"os"
	"strings"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

func CreatePodDevelopmentDeployment(
	clientSet *kubernetes.Clientset,
	namespace string,
	projectId string,
) error {
	replicaCount := int32(1)

	deployment := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name: "pod-" + strings.ToLower(projectId),
		},
		Spec: appsv1.DeploymentSpec{
			Replicas: &replicaCount,
			Selector: &metav1.LabelSelector{
				MatchLabels: map[string]string{
					"project": projectId,
				},
			},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: map[string]string{
						"project": projectId,
					},
				},
				Spec: corev1.PodSpec{
					Volumes: []corev1.Volume{
						{
							Name: "shared",
							VolumeSource: corev1.VolumeSource{
								EmptyDir: &corev1.EmptyDirVolumeSource{},
							},
						},
					},
					Containers: []corev1.Container{
						{
							Name:  "controller",
							Image: fmt.Sprintf("%s/elbavol-controller:latest", os.Getenv("DOCKER_USER_NAME")),
							Env: []corev1.EnvVar{
								{
									Name:  "PROJECT_ID",
									Value: projectId,
								},
								{
									Name: "KAFKA_URL", Value: "kafka-service:9092",
								},
							},
							VolumeMounts: []corev1.VolumeMount{
								{
									Name:      "shared",
									MountPath: "/app/shared",
								},
							},
						},
						{
							Name:  "serving",
							Image: fmt.Sprintf("%s/elbavol-serving:latest", os.Getenv("DOCKER_USER_NAME")),
							Env: []corev1.EnvVar{
								{
									Name:  "PROJECT_ID",
									Value: projectId,
								},
								{
									Name: "KAFKA_URL", Value: "kafka-service:9092",
								},
							},
							Ports: []corev1.ContainerPort{
								{
									ContainerPort: 5173,
								},
								{
									ContainerPort: 3000,
								},
								{
									ContainerPort: 3001,
								},
								{
									ContainerPort: 8080,
								},
							},
							VolumeMounts: []corev1.VolumeMount{
								{
									Name:      "shared",
									MountPath: "/app/shared",
								},
							},
						},
					},
				},
			},
		},
	}

	_, err := clientSet.AppsV1().Deployments(namespace).Create(context.Background(), deployment, metav1.CreateOptions{})
	if err != nil {
		return fmt.Errorf("failed to create pod development deployment: %v", err)
	}

	return nil
}
