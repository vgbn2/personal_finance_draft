/*
 * Filename: C04025.c
 * Description: C Program using functions: swap
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>

void swap(int *a, int *b)
{
    int tmp = *a;
    *a = *b;
    *b = tmp;
}

// Entry point
int main()
{
    int n;
    scanf("%d", &n); // Read input
    int a[101];
    int chan[101], nc = 0;
    int le[101], nl = 0;
    for (int i = 0; i < n; i++)
    {
        scanf("%d", &a[i]); // Read input
        if (a[i] % 2 == 0)
            chan[nc++] = a[i];
        else
            le[nl++] = a[i];
    }
    for (int i = 0; i < nc; i++)
    {
        for (int j = i + 1; j < nc; j++)
            if (chan[j] < chan[i])
                swap(&chan[i], &chan[j]);
        printf("%d ", chan[i]); // Print result
    }
    for (int i = 0; i < nl; i++)
    {
        for (int j = i + 1; j < nl; j++)
            if (le[j] < le[i])
                swap(&le[i], &le[j]);
        printf("%d ", le[i]); // Print result
    }
    return 0;
}