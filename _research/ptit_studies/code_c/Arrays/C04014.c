/*
 * Filename: C04014.c
 * Description: C Program
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>

// Entry point
int main()
{
    int n;
    scanf("%d", &n); // Read input
    int a[n], dd[100005] = {0};
    for (int i = 0; i < n; i++)
    {
        scanf("%d", &a[i]); // Read input
        dd[a[i]]++;
    }
    for (int i = 0; i < n; i++)
        if (dd[a[i]] > 0)
        {
            printf("%d %d\n", a[i], dd[a[i]]); // Print result
            dd[a[i]] = 0;
        }
    return 0;
}