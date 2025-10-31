package k8s

import (
	"context"
	"fmt"

	"k8s.io/client-go/kubernetes"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func CreatePod(
	clientSet *kubernetes.Clientset,
	namespace string,
	name string,
	image string,
	labels map[string]string,
) error {

	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:   name,
			Labels: labels,
		},
		Spec: corev1.PodSpec{
			Containers: []corev1.Container{
				{
					Name:  name,
					Image: image,
					// Ports: []corev1.ContainerPort{
					// 	{
					// 		ContainerPort: RandomeButValidAndAvailablePort(),
					// 	},
					// },
				},
			},
		},
	}

	_, err := clientSet.CoreV1().Pods(namespace).Create(context.TODO(), pod, metav1.CreateOptions{})
	if err != nil {
		return fmt.Errorf("failed to create pod %s: %v", name, err)
	}

	return nil
}
