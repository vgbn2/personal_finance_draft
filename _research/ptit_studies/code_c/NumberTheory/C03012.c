/*
 * Filename: C03012.c
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
    int f[100005];
    f[0] = 1;
    f[1] = 1;
    for (int i = 2;; i++)
    {
        f[i] = f[i - 1] + f[i - 2];
        if (f[i] == n)
        {
            printf("1"); // Print result
            return 0;
        }
        else if (f[i] > n)
        {
            printf("0"); // Print result
            return 0;
        }
    }
    return 0;
}