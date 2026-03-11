/*
 * Filename: C04029.c
 * Description: Sorts an array of elements using functions: swap, bubbleSort
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>
#include <stdbool.h>

void swap(int *a, int *b)
{
    int tmp = *a;
    *a = *b;
    *b = tmp;
}

void bubbleSort(int a[], int n)
{
    for (int i = 0; i < n - 1; i++)
    {
        bool check = false;
        for (int j = 0; j < n - i - 1; j++)
            if (a[j] > a[j + 1])
            {
                swap(&a[j], &a[j + 1]);
                check = true;
            }
        if (check == false)
            break;
        printf("Buoc %d: ", i + 1); // Print result
        for (int j = 0; j < n; j++)
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
    bubbleSort(a, n);
    return 0;
}