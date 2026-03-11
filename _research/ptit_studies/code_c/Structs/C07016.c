/*
 * Filename: C07016.c
 * Description: Calculates sums using functions: init
 * 
 * Test Case Example:
 * Input:
 *   [Insert Example Input Here]
 * Output:
 *   [Insert Example Output Here]
 */

// Import standard libraries
#include <stdio.h>
#include <string.h>

struct Student
{
    int id;
    char name[100], date[10];
    float d1, d2, d3, sum;
};

void init(struct Student sv[], int i)
{
    fflush(stdin);
    sv[i].id = i + 1;
    scanf("\n%[^\n]s", sv[i].name); // Read input
    scanf("%s", sv[i].date); // Read input
    scanf("%f %f %f", &sv[i].d1, &sv[i].d2, &sv[i].d3); // Read input
    sv[i].sum = sv[i].d1 + sv[i].d2 + sv[i].d3;
}

// Entry point
int main()
{
    int n;
    scanf("%d", &n); // Read input
    struct Student sv[n];
    for (int i = 0; i < n; i++)
        init(sv, i);
    for (int i = 0; i < n - 1; i++)
    {
        for (int j = i + 1; j < n; j++)
        {
            if (sv[j].sum > sv[i].sum)
            {
                struct Student temp = sv[i];
                sv[i] = sv[j];
                sv[j] = temp;
            }
        }
    }
    for (int i = 0; i < n; i++)
        printf("%d %s %s %.1f\n", sv[i].id, sv[i].name, sv[i].date, sv[i].sum); // Print result
    return 0;
}