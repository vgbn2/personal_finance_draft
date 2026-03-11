/*
 * Filename: C04028.c
 * Description: Sorts an array of elements using functions: insertionSort
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>

void insertionSort(int a[], int n)
{
    int key, j;
    for (int i = 0; i < n; i++)
    {
        key = a[i];
        j = i - 1;
        while (j >= 0 && a[j] > key)
        {
            a[j + 1] = a[j];
            j--;
        }
        a[j + 1] = key;
        printf("Buoc %d: ", i); // Print result
        for (int j = 0; j <= i; j++)
            printf("%d ", a[j]); // Print result
        printf("\n"); // Print result
    }
}

// Entry point
int main()
{
    int n;
    scanf("%d", &n); // Read input
    int a[100];
    for (int i = 0; i < n; i++)
        scanf("%d", &a[i]); // Read input
    insertionSort(a, n);
    return 0;
}